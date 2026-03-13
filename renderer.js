console.log('renderer.js loaded');
const webview = document.getElementById('soundcloud');

// ── Navigation buttons ────────────────────────────────────────────────────────
const navBack    = document.getElementById('nav-back');
const navForward = document.getElementById('nav-forward');

function updateNavButtons() {
  navBack.disabled    = !webview.canGoBack();
  navForward.disabled = !webview.canGoForward();
}

navBack.addEventListener('click',    () => { webview.goBack();    updateNavButtons(); });
navForward.addEventListener('click', () => { webview.goForward(); updateNavButtons(); });

webview.addEventListener('did-navigate',         updateNavButtons);
webview.addEventListener('did-navigate-in-page', updateNavButtons);
webview.addEventListener('dom-ready',            updateNavButtons);
// ─────────────────────────────────────────────────────────────────────────────

let themeCss = '';
let lastPlayState = null;
let lastLikeState = null;
let lastTrackTitle = '';
let lastTrackArtist = '';
let lastPosition = 0;
let lastDurationStr = '';

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

// Stores the observer at window.__csObserver so it can be disconnected later.
function setupMutationObserver() {
  if (!themeCss) return; // nothing to keep in place
  const escaped = themeCss.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  const script = `
    (function() {
      if (window.__csObserver) { window.__csObserver.disconnect(); window.__csObserver = null; }
      const styleId = 'custom-theme-style';
      const css = \`${escaped}\`;
      const observer = new MutationObserver(() => {
        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          style.textContent = css;
          document.head.appendChild(style);
        } else if (style.textContent !== css) {
          style.textContent = css;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.__csObserver = observer;
    })();
  `;
  webview.executeJavaScript(script).catch(console.error);
}

// Remove the custom theme and disconnect the observer
function clearTheme() {
  themeCss = '';
  webview.executeJavaScript(`
    (function() {
      if (window.__csObserver) { window.__csObserver.disconnect(); window.__csObserver = null; }
      const style = document.getElementById('custom-theme-style');
      if (style) style.remove();
    })();
  `).catch(console.error);
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

window.electronAPI.onClearTheme(() => clearTheme());

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

      // Artwork — media session is most reliable on SoundCloud
      let artwork = '';
      const ms = navigator.mediaSession?.metadata;
      if (ms?.artwork?.length) {
        artwork = ms.artwork[ms.artwork.length - 1].src;
      }
      if (!artwork) {
        const img = document.querySelector('.playbackSoundBadge__avatar .image__full');
        if (img) {
          const bg = window.getComputedStyle(img).backgroundImage;
          const match = bg.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (match) artwork = match[1];
        }
      }

      // Position from audio element (for seek detection)
      const audio = document.querySelector('audio');
      const position = audio ? Math.floor(audio.currentTime) : 0;

      // Time strings from the UI (reliable even before audio.duration loads)
      const currentTimeStr = document.querySelector('.playbackTimeline__timePassed span[aria-hidden="true"]')?.textContent?.trim() || '';
      const durationStr = document.querySelector('.playbackTimeline__duration span[aria-hidden="true"]')?.textContent?.trim() || '';

      return { isPlaying, isLiked, title, artist, artwork, position, currentTimeStr, durationStr };
    })();
  `).then(state => {
    if (!state) return;

    // Detect a seek: position jumped more than 1s ahead of where we expect it
    const seeked = state.isPlaying && Math.abs(state.position - (lastPosition + 1)) > 5;
    // When a new track starts, reset so durationBecameAvailable can fire again
    if (state.title !== lastTrackTitle) lastDurationStr = '';
    // Resend once the duration string loads so Discord gets the correct countdown
    const durationBecameAvailable = !!state.durationStr && !lastDurationStr;

    if (
      state.isPlaying !== lastPlayState ||
      state.isLiked !== lastLikeState ||
      state.title !== lastTrackTitle ||
      state.artist !== lastTrackArtist ||
      seeked ||
      durationBecameAvailable
    ) {
      window.electronAPI.sendPlaybackState(state);
      lastPlayState = state.isPlaying;
      lastLikeState = state.isLiked;
      lastTrackTitle = state.title;
      lastTrackArtist = state.artist;
    }

    lastPosition = state.position;
    lastDurationStr = state.durationStr;
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
  currentSettings = settings;

  document.getElementById('setting-notifications').checked = settings.notificationsEnabled;

  for (const [action, key] of Object.entries(settings.hotkeys)) {
    const input = document.getElementById(`hotkey-${action}`);
    if (input) input.value = key || '';
  }

  // Discord RPC
  document.getElementById('setting-discord-rpc').checked = settings.discordRpc?.enabled || false;

  // Last.FM
  document.getElementById('setting-lastfm-enabled').checked = settings.lastfm?.enabled || false;
  document.getElementById('setting-lastfm-api-key').value = settings.lastfm?.apiKey || '';
  document.getElementById('setting-lastfm-api-secret').value = settings.lastfm?.apiSecret || '';
  updateLastFMAuthUI(settings);

  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').focus();
}

let lastfmPendingToken = null;
let currentSettings = {};

function updateLastFMAuthUI(settings) {
  const isConnected = !!settings.lastfm?.sessionKey;
  const statusEl = document.getElementById('lastfm-auth-status');
  const actionsEl = document.getElementById('lastfm-auth-actions');
  const completeEl = document.getElementById('lastfm-complete-auth');

  if (isConnected) {
    statusEl.textContent = `Connected as ${settings.lastfm.username || 'unknown'}`;
    actionsEl.innerHTML = '<button id="lastfm-disconnect-btn" class="service-btn connected" type="button">Disconnect</button>';
    completeEl.style.display = 'none';
    document.getElementById('lastfm-disconnect-btn').addEventListener('click', async () => {
      await window.electronAPI.saveSettings({ lastfm: { sessionKey: '', username: '' } });
      currentSettings = await window.electronAPI.getSettings();
      updateLastFMAuthUI(currentSettings);
    });
  } else {
    statusEl.textContent = '';
    actionsEl.innerHTML = '<button id="lastfm-connect-btn" class="service-btn" type="button">Connect to Last.FM</button>';
    document.getElementById('lastfm-connect-btn').addEventListener('click', handleLastFMConnect);
  }
}

async function handleLastFMConnect() {
  const apiKey    = document.getElementById('setting-lastfm-api-key').value.trim();
  const apiSecret = document.getElementById('setting-lastfm-api-secret').value.trim();
  if (!apiKey || !apiSecret) {
    alert('Please enter your Last.FM API Key and Secret first.');
    return;
  }
  const result = await window.electronAPI.lastfmGetAuthToken(apiKey, apiSecret);
  if (!result.success) {
    alert(`Failed to get auth token: ${result.error}`);
    return;
  }
  lastfmPendingToken = result.token;
  document.getElementById('lastfm-complete-auth').style.display = '';
}

document.getElementById('lastfm-complete-btn').addEventListener('click', async () => {
  if (!lastfmPendingToken) return;
  const apiKey    = document.getElementById('setting-lastfm-api-key').value.trim();
  const apiSecret = document.getElementById('setting-lastfm-api-secret').value.trim();
  const result = await window.electronAPI.lastfmCompleteAuth(apiKey, apiSecret, lastfmPendingToken);
  if (!result.success) {
    alert(`Login failed: ${result.error}\nMake sure you authorized the app in your browser first.`);
    return;
  }
  lastfmPendingToken = null;
  document.getElementById('lastfm-complete-auth').style.display = 'none';
  currentSettings = await window.electronAPI.getSettings();
  updateLastFMAuthUI(currentSettings);
});

// Wire up hotkey inputs
document.querySelectorAll('.hotkey-input-wrap input[type="text"]').forEach(setupHotkeyInput);

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
    discordRpc: { enabled: document.getElementById('setting-discord-rpc').checked },
    lastfm: {
      enabled:   document.getElementById('setting-lastfm-enabled').checked,
      apiKey:    document.getElementById('setting-lastfm-api-key').value.trim(),
      apiSecret: document.getElementById('setting-lastfm-api-secret').value.trim(),
    },
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

// ── Navigation / load diagnostics ─────────────────────────────────────────────
webview.addEventListener('will-navigate', (e) => {
  console.log('[nav] will-navigate:', e.url);
});

webview.addEventListener('did-navigate', (e) => {
  console.log('[nav] did-navigate:', e.url, '| httpResponseCode:', e.httpResponseCode);
});

webview.addEventListener('did-navigate-in-page', (e) => {
  if (!e.isMainFrame) return;
  console.log('[nav] did-navigate-in-page:', e.url);

  // After SPA navigation, check if SoundCloud actually rendered content
  setTimeout(() => {
    webview.executeJavaScript(`
      (function() {
        const app = document.getElementById('app');
        const main = document.querySelector('.l-container, .sc-container, main, [role="main"]');
        const children = main ? main.children.length : 'no main';
        const appVis = app ? window.getComputedStyle(app).visibility : 'no #app';
        const appDisp = app ? window.getComputedStyle(app).display : 'no #app';
        const appH = app ? app.offsetHeight : 0;
        return { children, appVis, appDisp, appH, url: location.href };
      })()
    `).then(info => {
      console.log('[dom] after in-page nav:', JSON.stringify(info));
      if (info.appH === 0 || info.appVis === 'hidden' || info.appDisp === 'none') {
        console.warn('[dom] BLANK PAGE DETECTED — #app is not visible');
      }
    }).catch(console.error);
  }, 800);
});

webview.addEventListener('did-start-loading', () => {
  console.log('[nav] did-start-loading');
});

webview.addEventListener('did-stop-loading', () => {
  console.log('[nav] did-stop-loading, URL:', webview.getURL());
});

webview.addEventListener('did-finish-load', () => {
  console.log('[nav] did-finish-load, URL:', webview.getURL());
});

webview.addEventListener('did-fail-load', (e) => {
  console.warn('[nav] did-fail-load:', e.errorCode, e.errorDescription, '| URL:', e.validatedURL, '| isMainFrame:', e.isMainFrame);
});

webview.addEventListener('new-window', (e) => {
  console.log('[nav] new-window blocked — url:', e.url, '| frameName:', e.frameName, '| disposition:', e.disposition);
  // Load in-place so clicks on tracks/playlists don't silently vanish
  webview.loadURL(e.url);
});
// ── End navigation diagnostics ────────────────────────────────────────────────

webview.addEventListener('dom-ready', async () => {
  webview.insertCSS(`
    /* Hide scrollbars */
    ::-webkit-scrollbar { display: none; }
    -ms-overflow-style: none;
    scrollbar-width: none;
  `);

  webview.executeJavaScript(`
    (function() {
      function removeWebiModules() {
        document.querySelectorAll('.sidebarModule__webiEmbeddedModule').forEach(el => {
          const mod = el.closest('.sidebarModule');
          if (mod) mod.style.display = 'none'; // hide only — don't remove, or React crashes on unmount
        });
      }
      removeWebiModules();
      new MutationObserver(removeWebiModules)
        .observe(document.body, { childList: true, subtree: true });
    })();
  `).catch(console.error);

const baseCss = await window.electronAPI.getBaseCss();
  if (baseCss) {
    const escaped = baseCss.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    webview.executeJavaScript(`
      (function() {
        let style = document.getElementById('base-theme-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'base-theme-style';
          document.head.appendChild(style);
        }
        style.textContent = \`${escaped}\`;
      })();
    `).catch(console.error);
  }
})