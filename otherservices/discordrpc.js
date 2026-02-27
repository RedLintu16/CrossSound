// ── Set your Discord Application Client ID here ──────────────────────────────
// Create an app at https://discord.com/developers/applications to get one.
const CLIENT_ID = '1476801244424048793';
// ─────────────────────────────────────────────────────────────────────────────

let rpc = null;
let connected = false;
let reconnectTimer = null;
let lastActivity = null;

// ── Time helpers ──────────────────────────────────────────────────────────────

function toSeconds(hhmmss) {
  if (!hhmmss) return 0;
  const parts = hhmmss.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0] || 0);
}

function calcTimestamps(currentStr, totalStr) {
  const now = Date.now();
  const cur = toSeconds(currentStr);
  const tot = toSeconds(totalStr);
  if (!Number.isFinite(cur) || cur < 0 || !Number.isFinite(tot) || tot <= 0)
    return null;
  const start = now - cur * 1000;
  const end = start + tot * 1000;
  return { start, end };
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const va = a[k], vb = b[k];
    if (typeof va === 'object' && typeof vb === 'object') {
      if (!shallowEqual(va, vb)) return false;
    } else if (va !== vb) return false;
  }
  return true;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────

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
      if (lastActivity) rpc.setActivity(lastActivity).catch(() => {});
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

function setActivity(state) {
  if (!connected || !rpc) return;

  if (!state.isPlaying || !state.title) {
    rpc.clearActivity().catch(() => {});
    lastActivity = null;
    return;
  }

  const totSec = toSeconds(state.durationStr);
  const activity = {
    details: state.title,
    state: state.artist || 'SoundCloud',
    instance: false,
  };

  if (state.artwork) {
    activity.largeImageKey = state.artwork;
    activity.largeImageText = totSec > 0 ? formatDuration(totSec) : 'CrossSound';
  }

  const ts = calcTimestamps(state.currentTimeStr, state.durationStr);
  if (ts) {
    activity.startTimestamp = ts.start;
    activity.endTimestamp = ts.end;
  }

  if (shallowEqual(activity, lastActivity)) return;
  lastActivity = activity;
  rpc.setActivity(activity).catch((err) => console.error('[DiscordRPC] setActivity error:', err.message));
}

function update(state) {
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
