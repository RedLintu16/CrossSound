console.log('renderer.js loaded');
const webview = document.getElementById('soundcloud');

let themeCss = '';
let lastPlayState = null;
let lastLikeState = null;
let lastTrackTitle = '';
let lastTrackArtist = '';

// Helper to show small theme loaded notification popup
function showThemeNotification(themeName) {
  let notif = document.getElementById('theme-notification');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'theme-notification';
    notif.style = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: #fff;
      padding: 10px 20px;
      border-radius: 6px;
      font-family: sans-serif;
      font-size: 14px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      z-index: 9999;
    `;
    document.body.appendChild(notif);
  }
  notif.textContent = `Theme Loaded: ${themeName}`;
  notif.style.opacity = '1';
  notif.style.pointerEvents = 'auto';

  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.pointerEvents = 'none';
  }, 3000);
}

// Inject CSS into the webview
function injectCss(css) {
  themeCss = css;
  const escapedCss = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

  const script = `
    (function() {
      let style = document.getElementById('custom-theme-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'custom-theme-style';
        document.head.appendChild(style);
      }
      style.textContent = \`${escapedCss}\`;
    })();
  `;

  webview.executeJavaScript(script).catch(console.error);
}

// Setup MutationObserver to keep CSS applied if SoundCloud modifies DOM
function setupMutationObserver() {
  const script = `
    (function() {
      const styleId = 'custom-theme-style';
      const observer = new MutationObserver(() => {
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          style.textContent = \`${themeCss.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
          document.head.appendChild(style);
        } else if (style.textContent !== \`${themeCss.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`) {
          style.textContent = \`${themeCss.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    })();
  `;

  webview.executeJavaScript(script).catch(console.error);
}

// Handle "Load Theme" from context menu — opens file picker, applies + saves the theme
window.electronAPI.onOpenLoadThemeDialog(async () => {
  const themePath = await window.electronAPI.loadTheme();
  if (!themePath) return;
  const theme = await window.electronAPI.applyTheme(themePath);
  if (!theme) return;
  injectCss(theme.cssContent);
  setupMutationObserver();
  const themeName = theme.path.split(/[\\/]/).pop();
  showThemeNotification(themeName);
  window.electronAPI.saveTheme(themeName, theme.path);
});

// Apply theme and setup observer
window.electronAPI.onApplyTheme(({ cssContent, path }) => {
  injectCss(cssContent);
  setupMutationObserver();
  const themeName = path ? path.split(/[\\/]/).pop() : 'Unknown Theme';
  showThemeNotification(themeName);
});

// Media control commands from main
window.electronAPI.onMediaAction(({ action }) => {
  let js = '';
  switch (action) {
    case 'playpause':
      js = `document.querySelector('.playControl')?.click();`;
      break;
    case 'next':
      js = `document.querySelector('.skipControl__next')?.click();`;
      break;
    case 'previous':
      js = `document.querySelector('.skipControl__previous')?.click();`;
      break;
    case 'like':
      js = `document.querySelector('.playbackSoundBadge__like, .playbackSoundBadge__like.sc-button-like')?.click();`;
      break;
  }
  webview.executeJavaScript(js);
});

// Poll playback state every second and send to main if changed
function pollPlaybackState() {
  webview.executeJavaScript(`
    (function() {
      const playBtn = document.querySelector('.playControl');
      const likeBtn = document.querySelector('.playbackSoundBadge__like, .playbackSoundBadge__like.sc-button-like');
      const isPlaying = playBtn?.classList.contains('playing') || false;
      const isLiked = likeBtn?.classList.contains('sc-button-selected') || false;

      let title = '';
      const titleSpan = document.querySelector('.playbackSoundBadge__titleLink span[aria-hidden="true"]');
      if (titleSpan) title = titleSpan.textContent.trim();

      const artist = document.querySelector('.playbackSoundBadge__lightLink')?.textContent?.trim() || '';

      return { isPlaying, isLiked, title, artist };
    })();
  `).then(state => {
    if (
      state &&
      (
        state.isPlaying !== lastPlayState ||
        state.isLiked !== lastLikeState ||
        state.title !== lastTrackTitle ||
        state.artist !== lastTrackArtist
      )
    ) {
      window.electronAPI.sendPlaybackState(state);
      lastPlayState = state.isPlaying;
      lastLikeState = state.isLiked;
      lastTrackTitle = state.title;
      lastTrackArtist = state.artist;
    }
  }).catch(console.error);
}

setInterval(pollPlaybackState, 1000);

// Context menu handling (assuming correct ipc in preload)
webview.addEventListener('ipc-message', event => {
  if (event.channel === 'show-native-context-menu' && event.args[0]) {
    const { x, y } = event.args[0];
    window.electronAPI.showContextMenu(x, y);
  }
});
webview.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.electronAPI.showContextMenu(e.clientX, e.clientY);
});
window.addEventListener('contextmenu', e => {
  e.preventDefault();
  window.electronAPI.showContextMenu(e.clientX, e.clientY);
});

// ── Settings panel ────────────────────────────────────────────────────────────

let pendingHotkeys = {};

function keyEventToAccelerator(e) {
  const mods = [];
  if (e.ctrlKey)  mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey)   mods.push('Alt');
  if (e.metaKey)  mods.push('Meta');

  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;

  // Browser media key names → Electron accelerator names
  const mediaMap = {
    MediaPlayPause:       'MediaPlayPause',
    MediaTrackNext:       'MediaNextTrack',
    MediaTrackPrevious:   'MediaPreviousTrack',
    MediaStop:            'MediaStop',
  };
  if (mediaMap[key]) return mediaMap[key]; // media keys: no modifiers

  let name = key;
  if (/^[a-zA-Z]$/.test(key))   name = key.toUpperCase();
  else if (key === ' ')           name = 'Space';
  else if (key === 'ArrowUp')    name = 'Up';
  else if (key === 'ArrowDown')  name = 'Down';
  else if (key === 'ArrowLeft')  name = 'Left';
  else if (key === 'ArrowRight') name = 'Right';
  else if (key === 'Enter')      name = 'Return';

  if (!name) return null;
  return [...mods, name].join('+');
}

function setupHotkeyInput(input) {
  input.addEventListener('focus', () => {
    input.dataset.prevValue = input.value;
    input.value = '';
    input.placeholder = 'Press a key…';
    input.classList.add('recording');
  });

  input.addEventListener('blur', () => {
    input.classList.remove('recording');
    input.placeholder = 'Click to set…';
    if (!input.value) {
      input.value = input.dataset.prevValue || '';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (!input.classList.contains('recording')) return;
    e.preventDefault();
    e.stopPropagation();

    const accel = keyEventToAccelerator(e);
    if (!accel) return;

    input.value = accel;
    const action = input.id.replace('hotkey-', '');
    pendingHotkeys[action] = accel;
    input.blur();
  });
}

function openSettingsPanel(settings) {
  pendingHotkeys = { ...settings.hotkeys };

  document.getElementById('setting-notifications').checked = settings.notificationsEnabled;

  for (const [action, key] of Object.entries(settings.hotkeys)) {
    const input = document.getElementById(`hotkey-${action}`);
    if (input) input.value = key || '';
  }

  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').focus();
}

// Wire up hotkey inputs
document.querySelectorAll('#settings-panel input[type="text"]').forEach(setupHotkeyInput);

// Clear buttons
document.querySelectorAll('.hotkey-clear').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.value = '';
    const action = input.id.replace('hotkey-', '');
    pendingHotkeys[action] = '';
  });
});

document.getElementById('settings-cancel').addEventListener('click', () => {
  document.getElementById('settings-overlay').classList.remove('open');
});

document.getElementById('settings-save').addEventListener('click', async () => {
  await window.electronAPI.saveSettings({
    notificationsEnabled: document.getElementById('setting-notifications').checked,
    hotkeys: pendingHotkeys,
  });
  document.getElementById('settings-overlay').classList.remove('open');
});

// Close on click outside the panel
document.getElementById('settings-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('settings-overlay')) {
    document.getElementById('settings-overlay').classList.remove('open');
  }
});

window.electronAPI.onOpenSettings(async () => {
  const settings = await window.electronAPI.getSettings();
  openSettingsPanel(settings);
});

// ── End settings panel ────────────────────────────────────────────────────────

webview.addEventListener ('dom-ready',() => {
    webview.insertCSS(`
    /* For WebKit browsers (Chrome, Safari, Opera) */
    ::-webkit-scrollbar {
      display: none;
    }

    /* For IE, Edge */
    -ms-overflow-style: none;

    /* For Firefox */
    scrollbar-width: none;
  `);
})