const { nativeImage, globalShortcut } = require('electron');
const path = require('path');

function updateTaskbarButtons(mainWindow, state = {}) {
  if (process.platform !== 'win32') return;

  const playIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'icons', state.isPlaying ? 'pause.png' : 'play.png'));
  const nextIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'icons', 'next.png'));
  const prevIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'icons', 'prev.png'));
  const likeIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'icons', state.isLiked ? 'unlike.png' : 'like.png'));

  mainWindow.setThumbarButtons([
    {
      tooltip: 'Previous',
      icon: prevIcon,
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'previous' })
    },
    {
      tooltip: state.isPlaying ? 'Pause' : 'Play',
      icon: playIcon,
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'playpause' })
    },
    {
      tooltip: 'Next',
      icon: nextIcon,
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'next' })
    },
    {
      tooltip: state.isLiked ? 'Unlike' : 'Like',
      icon: likeIcon,
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'like' })
    }
  ]);
}

function tryRegister(key, handler) {
  if (!key) return;
  try {
    globalShortcut.register(key, handler);
  } catch (e) {
    console.error(`Failed to register hotkey "${key}":`, e);
  }
}

function registerMediaKeys(mainWindow, hotkeys = {}) {
  const k = {
    playpause: hotkeys.playpause || 'MediaPlayPause',
    next:      hotkeys.next      || 'MediaNextTrack',
    previous:  hotkeys.previous  || 'MediaPreviousTrack',
    like:      hotkeys.like      || 'F23',
  };
  const send = (action) => () => mainWindow?.webContents.send('crosssound-media-action', { action });
  tryRegister(k.playpause, send('playpause'));
  tryRegister(k.next,      send('next'));
  tryRegister(k.previous,  send('previous'));
  tryRegister(k.like,      send('like'));
}

function reregisterMediaKeys(mainWindow, hotkeys) {
  globalShortcut.unregisterAll();
  registerMediaKeys(mainWindow, hotkeys);
}

function unregisterMediaKeys() {
  globalShortcut.unregisterAll();
}

module.exports = {
  updateTaskbarButtons,
  registerMediaKeys,
  reregisterMediaKeys,
  unregisterMediaKeys,
};
