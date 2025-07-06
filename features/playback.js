const { nativeImage } = require('electron');
const path = require('path');

const { globalShortcut } = require('electron');

// Button callbacks
function updateTaskbarButtons(mainWindow, state = {}) {
  if (process.platform !== 'win32') return; // Only on Windows

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

function registerMediaKeys(mainWindow) {
  globalShortcut.register('MediaPlayPause', () => {
    if (mainWindow) {
      mainWindow.webContents.send('crosssound-media-action', { action: 'playpause' });
    }
  });

  globalShortcut.register('MediaNextTrack', () => {
    if (mainWindow) {
      mainWindow.webContents.send('crosssound-media-action', { action: 'next' });
    }
  });

  globalShortcut.register('MediaPreviousTrack', () => {
    if (mainWindow) {
      mainWindow.webContents.send('crosssound-media-action', { action: 'previous' });
    }
  });
}

function unregisterMediaKeys() {
  globalShortcut.unregisterAll();
}

module.exports = {
  updateTaskbarButtons,
  registerMediaKeys,
  unregisterMediaKeys,
};