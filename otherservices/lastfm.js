const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');

// ── Helpers ──────────────────────────────────────────────────────────────────

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/** Build an API signature from a params object + shared secret. */
function sign(params, secret) {
  const keys = Object.keys(params).filter(k => k !== 'format').sort();
  const str = keys.map(k => k + params[k]).join('') + secret;
  return md5(str);
}

function httpsPost(params) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({ ...params, format: 'json' });
    const options = {
      hostname: 'ws.audioscrobbler.com',
      path: '/2.0/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Last.FM')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(params) {
  return new Promise((resolve, reject) => {
    const qs = querystring.stringify({ ...params, format: 'json' });
    const options = {
      hostname: 'ws.audioscrobbler.com',
      path: `/2.0/?${qs}`,
      method: 'GET',
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Last.FM')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Step 1: Get a temporary token. Open the browser to auth URL with this token. */
async function getToken(apiKey, apiSecret) {
  const params = { method: 'auth.getToken', api_key: apiKey };
  params.api_sig = sign(params, apiSecret);
  const result = await httpsGet(params);
  if (result.error) throw new Error(result.message);
  return result.token;
}

/** Step 2: Exchange the authorized token for a session key. */
async function getSession(apiKey, apiSecret, token) {
  const params = { method: 'auth.getSession', api_key: apiKey, token };
  params.api_sig = sign(params, apiSecret);
  const result = await httpsGet(params);
  if (result.error) throw new Error(result.message);
  return result.session; // { name, key, subscriber }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function updateNowPlaying(apiKey, apiSecret, sessionKey, artist, track) {
  const params = {
    method: 'track.updateNowPlaying',
    api_key: apiKey,
    sk: sessionKey,
    artist,
    track,
  };
  params.api_sig = sign(params, apiSecret);
  const result = await httpsPost(params);
  if (result.error) throw new Error(result.message);
  return result;
}

async function scrobble(apiKey, apiSecret, sessionKey, artist, track, timestamp) {
  const params = {
    method: 'track.scrobble',
    api_key: apiKey,
    sk: sessionKey,
    artist,
    track,
    timestamp: String(timestamp),
  };
  params.api_sig = sign(params, apiSecret);
  const result = await httpsPost(params);
  if (result.error) throw new Error(result.message);
  return result;
}

// ── Scrobble state tracking ───────────────────────────────────────────────────

let currentTrack = null;   // { title, artist }
let playStartTime = null;  // Date.now() when play resumed
let accumulatedMs = 0;     // Total playtime accumulated before last pause
let scrobbleInfo = null;   // { title, artist, timestamp } for the pending scrobble

function resetTrack() {
  currentTrack = null;
  playStartTime = null;
  accumulatedMs = 0;
  scrobbleInfo = null;
}

function getPlayedMs() {
  let total = accumulatedMs;
  if (playStartTime !== null) total += Date.now() - playStartTime;
  return total;
}

async function tryScrobble(apiKey, apiSecret, sessionKey) {
  if (!scrobbleInfo) return;
  if (getPlayedMs() < 30000) {
    console.log('[LastFM] Track played < 30s, not scrobbling');
    return;
  }
  const { title: track, artist, timestamp } = scrobbleInfo;
  try {
    await scrobble(apiKey, apiSecret, sessionKey, artist, track, timestamp);
    console.log(`[LastFM] Scrobbled: ${artist} - ${track}`);
  } catch (err) {
    console.error('[LastFM] Scrobble failed:', err.message);
  }
}

/**
 * Called on every playback state update from the renderer.
 * state = { title, artist, isPlaying, isLiked }
 * settings = full settings object from getSettings()
 */
function update(state, settings) {
  const lfm = settings.lastfm;
  if (!lfm?.enabled || !lfm?.sessionKey || !lfm?.apiKey || !lfm?.apiSecret) return;

  const { apiKey, apiSecret, sessionKey } = lfm;
  const titleChanged =
    state.title !== currentTrack?.title || state.artist !== currentTrack?.artist;

  if (titleChanged && state.title) {
    // Scrobble the previous track before resetting
    if (currentTrack) {
      tryScrobble(apiKey, apiSecret, sessionKey);
    }

    // Start tracking the new track
    resetTrack();
    currentTrack = { title: state.title, artist: state.artist };

    if (state.isPlaying) {
      playStartTime = Date.now();
      scrobbleInfo = {
        title: state.title,
        artist: state.artist,
        timestamp: Math.floor(Date.now() / 1000),
      };
      updateNowPlaying(apiKey, apiSecret, sessionKey, state.artist, state.title)
        .catch(err => console.error('[LastFM] Now Playing failed:', err.message));
    }
    return;
  }

  if (!currentTrack) return;

  const wasPlaying = playStartTime !== null;

  if (state.isPlaying && !wasPlaying) {
    // Resumed
    playStartTime = Date.now();
    if (!scrobbleInfo) {
      scrobbleInfo = {
        title: state.title,
        artist: state.artist,
        timestamp: Math.floor(Date.now() / 1000),
      };
    }
    updateNowPlaying(apiKey, apiSecret, sessionKey, state.artist, state.title)
      .catch(err => console.error('[LastFM] Now Playing failed:', err.message));
  } else if (!state.isPlaying && wasPlaying) {
    // Paused
    accumulatedMs += Date.now() - playStartTime;
    playStartTime = null;
  }
}

function destroy() {
  resetTrack();
}

module.exports = { getToken, getSession, update, destroy };
