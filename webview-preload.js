console.log('webview-preload.js loaded');

const { ipcRenderer } = require('electron');
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ipcRenderer.sendToHost('show-native-context-menu', { x: e.clientX, y: e.clientY });
});
