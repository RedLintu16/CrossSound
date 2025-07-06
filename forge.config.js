module.exports = {
  packagerConfig: {
    icon: "assets/icon", // base name without extension
    asar: true,
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "crosssound",
        authors: "RedLintu16",
        description: "CrossSound - Cross-Platform SoundCloud Client",
        setupIcon: "assets/icon.ico"
      }
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"]
    },
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        icon: "assets/icon.icns",
        background: "assets/background.png",
        format: "ULFO"
      }
    }
  ],
"plugins": [
  {
    "name": "@electron-forge/plugin-auto-unpack-natives",
    "config": {}
  }
],
};
