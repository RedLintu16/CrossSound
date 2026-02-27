const fs = require('fs');
const path = require('path');

function collectJsFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      collectJsFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

module.exports = {
  packagerConfig: {
    icon: "assets/icon",
    asar: true,
  },

  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      const terser = require('terser');
      const files = collectJsFiles(buildPath);

      await Promise.all(files.map(async (file) => {
        const code = fs.readFileSync(file, 'utf8');
        const result = await terser.minify(code, {
          compress: true,
          mangle: false,        // keep variable names intact (safer for Electron IPC/require)
          format: { comments: false },
        });
        if (result.code) fs.writeFileSync(file, result.code, 'utf8');
      }));

      console.log(`Minified ${files.length} JS files in package.`);
    },
  },

  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "crosssound",
        authors: "RedLintu16",
        description: "CrossSound - Cross-Platform SoundCloud Client",
        setupIcon: "assets/icon.ico",
        loadingGif: "assets/installer-loading.gif",
      }
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: {
        options: {
          name: "crosssound",
          productName: "CrossSound",
          genericName: "Music Player",
          description: "CrossSound - Cross-Platform SoundCloud Client",
          categories: ["Audio", "Music"],
          icon: "assets/icon.png",
        }
      }
    },
    {
      name: "@electron-forge/maker-rpm",
      platforms: ["linux"],
      config: {
        options: {
          name: "crosssound",
          productName: "CrossSound",
          description: "CrossSound - Cross-Platform SoundCloud Client",
          categories: ["Audio", "Music"],
          icon: "assets/icon.png",
        }
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        icon: "assets/icon.icns",
        background: "assets/background.png",
        format: "ULFO",
      }
    },
  ],

  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {}
    }
  ],
};
