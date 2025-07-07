// features/notifications.js
const { Notification } = require('electron');

let Store;
let store;

let notificationSettings = {
  nowPlaying: true,
  paused: true,
  liked: true,
  unliked: true,
};

// Initialize store and load saved settings
async function init() {
  Store = (await import('electron-store')).default;
  store = new Store();

  const savedSettings = store.get('notifications');
  if (savedSettings) {
    notificationSettings = { ...notificationSettings, ...savedSettings };
  }
  console.log('[Notifications] Loaded settings:', notificationSettings);
}

// Always get the current notification settings fresh
function getNotificationSettings() {
  return notificationSettings;
}

// Update notification settings and persist
function setNotificationSettings(newSettings) {
  notificationSettings = { ...notificationSettings, ...newSettings };
  if (store) {
    store.set('notifications', notificationSettings);
  }
  console.log('[Notifications] Updated settings:', notificationSettings);
}

// Safe string helper
function safe(str, fallback = 'Unknown') {
  return (typeof str === 'string' && str.trim()) ? str.trim() : fallback;
}

// Notification functions, checking enabled state live
function showNowPlaying(title, artist) {
  if (!getNotificationSettings().nowPlaying) {
    console.log('[Notification] Now Playing skipped (disabled)');
    return;
  }
  console.log(`[Notification] Now Playing: ${title} - ${artist}`);
  new Notification({
    title: 'Now Playing',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
  }).show();
}

function showPaused(title, artist) {
  if (!getNotificationSettings().paused) {
    console.log('[Notification] Paused skipped (disabled)');
    return;
  }
  console.log(`[Notification] Paused: ${title} - ${artist}`);
  new Notification({
    title: 'Paused',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
  }).show();
}

function showLiked(title, artist) {
  if (!getNotificationSettings().liked) {
    console.log('[Notification] Liked skipped (disabled)');
    return;
  }
  console.log(`[Notification] Liked: ${title} - ${artist}`);
  new Notification({
    title: 'Liked Song',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
  }).show();
}

function showUnliked(title, artist) {
  if (!getNotificationSettings().unliked) {
    console.log('[Notification] Unliked skipped (disabled)');
    return;
  }
  console.log(`[Notification] Unliked: ${title} - ${artist}`);
  new Notification({
    title: 'Unliked Song',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
  }).show();
}

module.exports = {
  init,
  getNotificationSettings,
  setNotificationSettings,
  showNowPlaying,
  showPaused,
  showLiked,
  showUnliked,
};
