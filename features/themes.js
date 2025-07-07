const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const themesFilePath = path.join(app.getPath('userData'), 'themes.json');
const lastThemeFilePath = path.join(app.getPath('userData'), 'last-theme.json');

const loadedThemes = [];

/**
 * Load saved themes into loadedThemes array, mutating it so the reference stays intact.
 */
function loadSavedThemes() {
  try {
    if (fs.existsSync(themesFilePath)) {
      const data = fs.readFileSync(themesFilePath, 'utf8');
      const parsed = JSON.parse(data);
      loadedThemes.splice(0, loadedThemes.length, ...parsed); // Replace contents in-place
    } else {
      loadedThemes.splice(0, loadedThemes.length); // Clear array if no file
    }
  } catch (err) {
    console.error('Error loading saved themes:', err);
    loadedThemes.splice(0, loadedThemes.length);
  }
}

/**
 * Save current loadedThemes array to disk.
 */
function saveThemes() {
  try {
    fs.writeFileSync(themesFilePath, JSON.stringify(loadedThemes, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving themes:', err);
  }
}

function saveLastTheme(themePath) {
  try {
    fs.writeFileSync(lastThemeFilePath, JSON.stringify({ path: themePath }), 'utf8');
  } catch (err) {
    console.error('Error saving last theme:', err);
  }
}

function loadLastTheme() {
  try {
    if (fs.existsSync(lastThemeFilePath)) {
      const data = fs.readFileSync(lastThemeFilePath, 'utf8');
      const json = JSON.parse(data);
      return json.path || null;
    }
  } catch (err) {
    console.error('Error loading last theme:', err);
  }
  return null;
}

module.exports = {
  loadedThemes,
  loadSavedThemes,
  saveThemes,
  saveLastTheme,
  loadLastTheme,
};
