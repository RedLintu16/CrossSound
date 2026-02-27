// ── Set your Discord Application Client ID here ──────────────────────────────
// Create an app at https://discord.com/developers/applications to get one.
const CLIENT_ID = '1476801244424048793';
// ─────────────────────────────────────────────────────────────────────────────

let rpc = null;
let connected = false;
let reconnectTimer = null;
let lastState = null;

async function connect() {
  clearTimeout(reconnectTimer);

  if (rpc) {
    try { await rpc.destroy(); } catch (_) {}
    rpc = null;
  }
  connected = false;

  let DiscordRPC;
  try {
    DiscordRPC = require('discord-rpc');
  } catch (err) {
    console.error('[DiscordRPC] discord-rpc package not found:', err.message);
    return;
  }

  try {
    rpc = new DiscordRPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
      connected = true;
      console.log('[DiscordRPC] Connected');
      if (lastState) setActivity(lastState);
    });

    rpc.on('disconnected', () => {
      connected = false;
      console.log('[DiscordRPC] Disconnected — will retry in 15s');
      scheduleReconnect();
    });

    await rpc.login({ clientId: CLIENT_ID });
  } catch (err) {
    console.error('[DiscordRPC] Connection failed:', err.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, 15000);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function setActivity(state) {
  if (!connected || !rpc) return;

  if (!state.isPlaying || !state.title) {
    rpc.clearActivity().catch(() => {});
    return;
  }

  const activity = {
    details: state.title,
    state: state.artist || 'SoundCloud',
    instance: false,
  };

  // Album artwork (URL directly from SoundCloud)
  if (state.artwork) {
    activity.largeImageKey = state.artwork;
    activity.largeImageText = state.duration ? formatDuration(state.duration) : 'CrossSound';
  }

  // Remaining time — Discord counts down to zero
  if (state.duration > 0 && state.position !== undefined) {
    activity.endTimestamp = Date.now() + (state.duration - state.position) * 1000;
  }

  rpc.setActivity(activity).catch((err) => console.error('[DiscordRPC] setActivity error:', err.message));
}

function update(state) {
  lastState = state;
  setActivity(state);
}

function destroy() {
  clearTimeout(reconnectTimer);
  if (rpc) {
    try { rpc.destroy(); } catch (_) {}
    rpc = null;
  }
  connected = false;
}

module.exports = { connect, update, destroy };
