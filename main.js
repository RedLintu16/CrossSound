const { app, BrowserWindow, ipcMain, globalShortcut, Menu, MenuItem, dialog, Notification } = require('electron');
if (process.platform === 'win32') {app.setAppUserModelId('CrossSound');}
const path = require('path');
const { createSystemTray, updateTrayMenu } = require('./features/systemtray.js');
const { updateTaskbarButtons, registerMediaKeys, unregisterMediaKeys } = require('./features/playback.js');
const notifications = require('./features/notifications.js');
const fs = require('fs').promises;

const iconPath = process.platform === 'win32' ? 'assets/icon.ico' :
                 process.platform === 'darwin' ? 'assets/icon.icns' :
                 'assets/icon.png';

const {
  loadedThemes,
  loadSavedThemes,
  saveThemes,
  saveLastTheme,
  loadLastTheme,
} = require('./features/themes.js');

const lastThemePath = loadLastTheme();

let mainWindow;
let tray;
let lastNotificationState = {};
let initialized = false;

const lastThemeFilePath = path.join(app.getPath('userData'), 'last-theme.json');

ipcMain.on('crosssound-playback-state', (event, state) => {
  if (!mainWindow) return;

  updateTaskbarButtons(mainWindow, state);
  updateTrayMenu(mainWindow, state);

  if (
    !initialized &&
    state.title && state.title.trim() !== '' &&
    state.artist && state.artist.trim() !== ''
  ) {
    initialized = true;
    lastNotificationState = { ...state };
    return; // no notification on first valid track
  }

  if (!initialized) return;

  // Play/Pause notifications
  if (state.isPlaying !== lastNotificationState.isPlaying) {
    if (state.isPlaying) notifications.showNowPlaying(state.title, state.artist);
    else notifications.showPaused(state.title, state.artist);
  }

  // Like/Unlike notifications
  if (state.isLiked !== lastNotificationState.isLiked) {
    if (state.isLiked) notifications.showLiked(state.title, state.artist);
    else notifications.showUnliked(state.title, state.artist);
  }

  // New track notification
  if (state.title !== lastNotificationState.title && state.title) {
    notifications.showNowPlaying(state.title, state.artist);
  }

  lastNotificationState = { ...state };
});

ipcMain.handle('load-theme-dialog', async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Select a theme CSS file',
    properties: ['openFile'],
    filters: [{ name: 'CSS Files', extensions: ['css'] }],
  });

  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('read-theme-css', async (event, themePath) => {
  try {
    const cssContent = await fs.readFile(themePath, 'utf-8');
    return { path: themePath, cssContent };
  } catch (err) {
    console.error('Failed to read CSS:', err);
    return null;
  }
});


// Context menu — build submenu dynamically from loadedThemes
ipcMain.on('show-native-context-menu', async (event, { x, y }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const menu = new Menu();

  // Build the themes submenu from loadedThemes
  if (loadedThemes.length > 0) {
    const themeSubmenu = new Menu();
    loadedThemes.forEach(theme => {
      themeSubmenu.append(new MenuItem({
        label: theme.name,
        click: async () => {
          try {
            const cssContent = await fs.readFile(theme.path, 'utf-8');
            win.webContents.send('apply-theme', { path: theme.path, cssContent });
            saveLastTheme(theme.path);
          } catch (error) {
            console.error('Failed to read theme CSS:', error);
          }
        }
      }));
    });
    menu.append(new MenuItem({
      label: 'Load Themes…',
      submenu: themeSubmenu
    }));
  }

  // Add a separate Load Theme button that opens the picker dialog
  menu.append(new MenuItem({
    label: 'Load Theme',
    click: () => {
      win.webContents.send('open-load-theme-dialog');
    }
  }));

  menu.append(new MenuItem({ type: 'separator' }));

  menu.append(new MenuItem({
    label: 'Reload',
    click: () => event.sender.send('reload-webview'),
  }));

  menu.popup({ window: win, x, y });
});


notifications.showNowPlaying = (title, artist, artworkImg) => {
  //new Notification({
    //title:""
    //title: `Now Playing: ${title}`,
    //body: `Artist: ${artist}`,
   // icon: artworkImg || 'path/to/default/icon.png'
 // }).show();
    new Notification ({
      title: 'CrossSound',
      body: `Now Playing: ${title}\nArtist: ${artist}`
    }).show()
};

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    }
  });

  await mainWindow.loadFile('index.html');

  updateTaskbarButtons(mainWindow, { isPlaying: false, isLiked: false });

mainWindow.on('close', (event) => {
  if (!app.isQuitting) {  // <-- fix typo here
    event.preventDefault();
    mainWindow.hide();
  }
});

  tray = createSystemTray(mainWindow);

  // Load and apply last theme if any
  const lastThemePath = loadLastTheme();
  if (lastThemePath) {
    try {
      const cssContent = await fs.readFile(lastThemePath, 'utf-8');
      mainWindow.webContents.send('apply-theme', { path: lastThemePath, cssContent });
    } catch (error) {
      console.error('Failed to load last theme CSS:', error);
    }
  }
}

app.whenReady().then(async () => {
  loadSavedThemes();
  await createWindow();
  registerMediaKeys(mainWindow);

  const contextMenu = (await import('electron-context-menu')).default;
  contextMenu({ window: mainWindow });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterMediaKeys();
});
