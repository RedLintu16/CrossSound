const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const defaults = {
  notificationsEnabled: true,
  hotkeys: {
    playpause: 'MediaPlayPause',
    next: 'MediaNextTrack',
    previous: 'MediaPreviousTrack',
    like: 'F23',
  },
  discordRpc: {
    enabled: false,
  },
  lastfm: {
    enabled: false,
    apiKey: '',
    apiSecret: '',
    sessionKey: '',
    username: '',
  },
};

let current = JSON.parse(JSON.stringify(defaults));

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      current = {
        ...defaults,
        ...data,
        hotkeys:    { ...defaults.hotkeys,    ...(data.hotkeys    || {}) },
        discordRpc: { ...defaults.discordRpc, ...(data.discordRpc || {}) },
        lastfm:     { ...defaults.lastfm,     ...(data.lastfm     || {}) },
      };
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return current;
}

function saveSettings(updates) {
  current = {
    ...current,
    ...updates,
    hotkeys:    { ...current.hotkeys,    ...(updates.hotkeys    || {}) },
    discordRpc: { ...current.discordRpc, ...(updates.discordRpc || {}) },
    lastfm:     { ...current.lastfm,     ...(updates.lastfm     || {}) },
  };
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings:', err);
  }
  return current;
}

function getSettings() {
  return current;
}

module.exports = { loadSettings, saveSettings, getSettings };
