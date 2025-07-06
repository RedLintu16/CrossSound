const { Notification } = require('electron');

function safe(str, fallback = 'Unknown') {
  return (typeof str === 'string' && str.trim()) ? str.trim() : fallback;
}

function showNowPlaying(title, artist) {
  new Notification({
    title: 'Now Playing',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
    silent: false
  }).show();
}
// Do the same for the other notification types:
function showPaused(title, artist) {
  new Notification({
    title: 'Paused',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
    silent: false
  }).show();
}
function showLiked(title, artist) {
  new Notification({
    title: 'Liked Song',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
    silent: false
  }).show();
}
function showUnliked(title, artist) {
  new Notification({
    title: 'Unliked Song',
    body: `Song: ${safe(title)}\nArtist: ${safe(artist)}`,
    silent: false
  }).show();
}

module.exports = {
  showNowPlaying,
  showPaused,
  showLiked,
  showUnliked
};