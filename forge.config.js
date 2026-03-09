const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { MakerBase } = require('@electron-forge/maker-base');

// ── Arch Linux maker ──────────────────────────────────────────────────────────
class MakerArch extends MakerBase {
  name = 'maker-arch';
  defaultPlatforms = ['linux'];

  isSupportedOnCurrentPlatform() {
    try { execSync('which makepkg', { stdio: 'ignore' }); return true; }
    catch { return false; }
  }

  async make({ dir, makeDir, packageJSON }) {
    if (process.platform !== 'linux') throw new Error('Arch packages can only be built on Linux.');

    // Read pkgname from PKGBUILD so the tarball name always matches
    const pkgbuildTemplate = fs.readFileSync(path.join(__dirname, 'PKGBUILD'), 'utf8');
    const pkgnameMatch = pkgbuildTemplate.match(/^pkgname=(.+)$/m);
    if (!pkgnameMatch) throw new Error('Could not find pkgname in PKGBUILD');
    const pkgname = pkgnameMatch[1].trim();
    const pkgver  = packageJSON.version;
    const srcName = `${pkgname}-${pkgver}`;
    const workDir = path.join(makeDir, 'arch');
    const srcDir  = path.join(workDir, 'src', srcName);

    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(srcDir, { recursive: true });

    // Stage asar + assets
    fs.copyFileSync(path.join(dir, 'resources', 'app.asar'), path.join(srcDir, 'app.asar'));
    copyRecursive(path.join(__dirname, 'assets'), path.join(srcDir, 'assets'));

    // Create source tarball and stamp version into PKGBUILD
    execSync(`tar -czf "${srcName}.tar.gz" -C src "${srcName}"`, { cwd: workDir, stdio: 'inherit' });
    fs.writeFileSync(
      path.join(workDir, 'PKGBUILD'),
      pkgbuildTemplate.replace(/%%VERSION%%/g, pkgver)
    );

    try {
      execSync('makepkg --skipinteg --nodeps --nocheck -f', { cwd: workDir, stdio: 'pipe' });
    } catch (err) {
      throw new Error(`makepkg failed:\n${err.stdout?.toString()}\n${err.stderr?.toString()}`);
    }

    const pkgFile = fs.readdirSync(workDir).find(f => f.endsWith('.pkg.tar.zst'));
    if (!pkgFile) throw new Error('makepkg did not produce a .pkg.tar.zst file.');

    const outPath = path.join(makeDir, pkgFile);
    fs.copyFileSync(path.join(workDir, pkgFile), outPath);
    return [outPath];
  }
}
// ── End Arch maker ────────────────────────────────────────────────────────────

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyRecursive(path.join(src, entry), path.join(dest, entry));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

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
          mangle: false,
          format: { comments: false },
        });
        if (result.code) fs.writeFileSync(file, result.code, 'utf8');
      }));

      console.log(`Minified ${files.length} JS files in package.`);
    },

    postPackage: async (_config, packageResult) => {
      // Copy the asar to out/app.asar for easy access
      const asarSrc = path.join(packageResult.outputPaths[0], 'resources', 'app.asar');
      const asarDest = path.join(__dirname, 'out', 'app.asar');
      fs.mkdirSync(path.dirname(asarDest), { recursive: true });
      fs.copyFileSync(asarSrc, asarDest);
      console.log('app.asar copied to out/app.asar');
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
          icon: "assets/icon.ico",
        }
      }
    },
    new MakerArch(),
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
