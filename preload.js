const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onMediaAction: (callback) => ipcRenderer.on('crosssound-media-action', (event, arg) => callback(arg)),
  sendPlaybackState: (state) => ipcRenderer.send('crosssound-playback-state', state),
  onNavigateWebview: (callback) => ipcRenderer.on('navigate-webview', (event, url) => callback(url)),
  loadTheme: () => ipcRenderer.invoke('load-theme-dialog'),
  onOpenLoadThemeDialog: (callback) => ipcRenderer.on('open-load-theme-dialog', callback),
  send: (channel, data) => ipcRenderer.send(channel, data),
  showContextMenu: (x, y) => ipcRenderer.send('show-native-context-menu', { x, y }),
   applyTheme: (themePath) => ipcRenderer.invoke('read-theme-css', themePath),
  onApplyTheme: (callback) => ipcRenderer.on('apply-theme', (event, themePath) => callback(themePath)),
  on: (channel, callback) => ipcRenderer.on(channel, (event, data) => callback(data)),
});


ipcRenderer.on('open-load-theme-dialog', () => {
  if (typeof openLoadThemeDialogHandler === 'function') {
    openLoadThemeDialogHandler();
  }
});
