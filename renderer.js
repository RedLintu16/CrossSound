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
  webview.executeJavaScript(js).catch(console.error);
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

// Context menu handling
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

webview.addEventListener('dom-ready', () => {
  webview.insertCSS(`
    /* Hide scrollbar */
    ::-webkit-scrollbar {
      display: none;
    }
    -ms-overflow-style: none;
    scrollbar-width: none;
  `);
});

function removeCustomTheme() {
  const script = `
    (function() {
      const style = document.getElementById('custom-theme-style');
      if (style) {
        style.remove();
      }
    })();
  `;
  webview.executeJavaScript(script).catch(console.error);
}

window.electronAPI.on('remove-theme', () => {
  const script = `
    const style = document.getElementById('custom-theme-style');
    if (style) style.remove();
  `;
  const webview = document.getElementById('soundcloud');
  if (webview) webview.executeJavaScript(script).catch(console.error);
});

