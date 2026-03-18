const { app, BrowserWindow, ipcMain, globalShortcut, Menu, MenuItem, dialog, Notification, shell } = require('electron');

if (require('electron-squirrel-startup')) app.quit();
if (process.platform === 'win32') {app.setAppUserModelId('CrossSound');}
const path = require('path');
const { createSystemTray, updateTrayMenu } = require('./features/systemtray.js');
const { updateTaskbarButtons, registerMediaKeys, reregisterMediaKeys, unregisterMediaKeys } = require('./features/playback.js');
const { loadSettings, saveSettings, getSettings } = require('./features/settings.js');
const notifications = require('./features/notifications.js');
const discordrpc = require('./otherservices/discordrpc.js');
const lastfm = require('./otherservices/lastfm.js');
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
let notificationTimer = null;
let notificationBaseline = null;

const lastThemeFilePath = path.join(app.getPath('userData'), 'last-theme.json');

ipcMain.on('crosssound-playback-state', (event, state) => {
  if (!mainWindow) return;

  updateTaskbarButtons(mainWindow, state);
  updateTrayMenu(mainWindow, state);

  const s = getSettings();
  if (s.discordRpc?.enabled) discordrpc.update(state);
  lastfm.update(state, s);

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

  if (!getSettings().notificationsEnabled) {
    lastNotificationState = { ...state };
    return;
  }

  const titleChanged = state.title && state.title !== lastNotificationState.title;
  const playChanged = state.isPlaying !== lastNotificationState.isPlaying;
  const likeChanged = state.isLiked !== lastNotificationState.isLiked;

  if (titleChanged || playChanged || likeChanged) {
    // Only snapshot the baseline at the START of a new debounce window.
    // If the timer is already running (e.g. isPlaying briefly flickered),
    // we keep the original baseline so transient flips don't trigger a notification.
    if (!notificationTimer) {
      notificationBaseline = { ...lastNotificationState };
    }
    clearTimeout(notificationTimer);
    const snap = { ...state };
    notificationTimer = setTimeout(() => {
      notificationTimer = null;
      const tc = snap.title && snap.title !== notificationBaseline.title;
      const pc = snap.isPlaying !== notificationBaseline.isPlaying;
      const lc = snap.isLiked !== notificationBaseline.isLiked;

      if (tc) {
        notifications.showNowPlaying(snap.title, snap.artist);
      }
      if (!tc && pc) {
        if (snap.isPlaying) notifications.showNowPlaying(snap.title, snap.artist);
        else notifications.showPaused(snap.title, snap.artist);
      }
      if (!tc && lc) {
        if (snap.isLiked) notifications.showLiked(snap.title, snap.artist);
        else notifications.showUnliked(snap.title, snap.artist);
      }
    }, 1500);
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

  ipcMain.handle('lastfm-get-auth-token', async (_event, { apiKey, apiSecret }) => {
  try {
    const token = await lastfm.getToken(apiKey, apiSecret);
    shell.openExternal(`https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`);
    return { success: true, token };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('lastfm-complete-auth', async (_event, { apiKey, apiSecret, token }) => {
  try {
    const session = await lastfm.getSession(apiKey, apiSecret, token);
    saveSettings({ lastfm: { sessionKey: session.key, username: session.name } });
    return { success: true, username: session.name };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('save-settings', (_event, updates) => {
  const prev = getSettings();
  const s = saveSettings(updates);
  reregisterMediaKeys(mainWindow, s.hotkeys);
  const rpc = s.discordRpc;
  if (rpc?.enabled && !prev.discordRpc?.enabled) discordrpc.connect();
  else if (!rpc?.enabled && prev.discordRpc?.enabled) discordrpc.destroy();
  return s;
});

ipcMain.handle('get-themes', () => [...loadedThemes]);

ipcMain.handle('delete-theme', (_event, themePath) => {
  const idx = loadedThemes.findIndex(t => t.path === themePath);
  if (idx !== -1) {
    loadedThemes.splice(idx, 1);
    saveThemes();
    const last = loadLastTheme();
    if (last === themePath) saveLastTheme(null);
    if (loadedThemes.length === 0 && mainWindow) {
      mainWindow.webContents.send('clear-theme');
      saveLastTheme(null);
    }
  }
});

ipcMain.handle('save-theme', (event, { name, path }) => {
  if (!loadedThemes.find(t => t.path === path)) {
    loadedThemes.push({ name, path });
    saveThemes();
  }
  saveLastTheme(path);
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

ipcMain.handle('read-base-css', async () => {
  try {
    return await fs.readFile(path.join(__dirname, 'styles/main/soundcloud.css'), 'utf-8');
  } catch (err) {
    return '';
  }
});


// Context menu — build submenu dynamically from loadedThemes



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
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#cccccc',
      height: 36,
    },
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
  loadSettings();
  loadSavedThemes();
  await createWindow();
  const s = getSettings();
  registerMediaKeys(mainWindow, s.hotkeys);

  if (s.discordRpc?.enabled) {
    discordrpc.connect();
  }

  const contextMenu = (await import('electron-context-menu')).default;
  contextMenu({ window: mainWindow });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterMediaKeys();
  discordrpc.destroy();
  lastfm.destroy();
});