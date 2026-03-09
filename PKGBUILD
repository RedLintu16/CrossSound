pkgname=CrossSound
pkgver=0.2.0
pkgrel=1
pkgdesc='CrossSound'
arch=('x86_64')
license=('MIT')
depends=('electron' 'xdg-desktop-portal')
source=("$pkgname-$pkgver.tar.gz")
sha256sums=('SKIP')

package() {
  cd "$srcdir/$pkgname-$pkgver"

  install -Dm644 app.asar "$pkgdir/usr/lib/$pkgname/app.asar"
  install -Dm644 assets/icon.ico "$pkgdir/usr/share/pixmaps/$pkgname.ico"

  install -dm755 "$pkgdir/usr/bin"
  printf '#!/bin/bash\nexec /usr/bin/electron /usr/lib/%s/app.asar "$@"\n' \
    "$pkgname" > "$pkgdir/usr/bin/$pkgname"
  chmod +x "$pkgdir/usr/bin/$pkgname"

  install -Dm644 /dev/stdin "$pkgdir/usr/share/applications/$pkgname.desktop" <<'DESKTOP'
[Desktop Entry]
Name=CrossSound
Comment=Cross-Platform SoundCloud Client
Exec=crosssound %U
Icon=/usr/share/pixmaps/CrossSound.ico
Terminal=false
Type=Application
Categories=Audio;Music;
DESKTOP
}
