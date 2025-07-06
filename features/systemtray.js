const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;
let trayState = { isPlaying: false, isLiked: false };

function icon(name) {
  return nativeImage.createFromPath(path.join(__dirname, '..', 'icons', name));
}

// Exported for dynamic updating from main.js
function updateTrayMenu(mainWindow, state = {}) {
  trayState = state;
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: state.isPlaying ? 'Pause' : 'Play',
      icon: icon(state.isPlaying ? 'pause.png' : 'play.png'),
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'playpause' })
    },
    {
      label: 'Next',
      icon: icon('next.png'),
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'next' })
    },
    {
      label: 'Previous',
      icon: icon('prev.png'),
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'previous' })
    },
    {
      label: state.isLiked ? 'Unlike' : 'Like',
      icon: icon(state.isLiked ? 'unlike.png' : 'like.png'),
      click: () => mainWindow.webContents.send('crosssound-media-action', { action: 'like' })
    },
    { type: 'separator' },
    {
      label: 'Show CrossSound',
      click: () => mainWindow.show()
    },
    {
      label: 'Minimize to Tray',
      click: () => mainWindow.hide()
    },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function createSystemTray(mainWindow) {
  tray = new Tray(icon('tray.png'));
  tray.setToolTip('CrossSound');
  updateTrayMenu(mainWindow, trayState);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
  return tray;
}

module.exports = { createSystemTray, updateTrayMenu };
