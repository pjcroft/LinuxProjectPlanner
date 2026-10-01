#!/usr/bin/env bash
# Build a self-contained Ubuntu/Debian installer from this checkout.
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-0.1.0}"
ARCH="$(dpkg --print-architecture)"
DIST="$ROOT/dist"
mkdir -p "$DIST"
STAGE="$(mktemp -d "$DIST/pc-plan-stage.XXXXXX")"
PACKAGE="$DIST/pc-plan_${VERSION}_${ARCH}.deb"
APP="$STAGE/usr/lib/pc-plan"

install -d "$APP" "$APP/.runtime" "$STAGE/DEBIAN" "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/scalable/apps" \
  "$STAGE/usr/share/mime/packages"
install -m 755 "$ROOT/launch.sh" "$ROOT/desktop.py" "$ROOT/server.py" \
  "$ROOT/mpp_import.py" "$ROOT/pdf_export.py" "$APP/"
cp -a "$ROOT/app" "$ROOT/assets" "$APP/"
cp -a "$ROOT/.runtime/python" "$ROOT/.runtime/java" "$APP/.runtime/"

cat >"$STAGE/usr/bin/pc-plan" <<'EOF'
#!/usr/bin/env bash
exec /usr/lib/pc-plan/launch.sh "$@"
EOF
chmod 755 "$STAGE/usr/bin/pc-plan"

cat >"$STAGE/usr/share/applications/io.github.pjcroft.PCPlan.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Version=1.0
Name=PC Plan
Comment=Plan projects with a task grid and Gantt chart
Exec=pc-plan %f
Icon=io.github.pjcroft.PCPlan
Terminal=false
Categories=Office;ProjectManagement;
MimeType=application/x-pc-plan;application/x-fieldplan;
EOF
install -m 644 "$ROOT/assets/fieldplan.svg" "$STAGE/usr/share/icons/hicolor/scalable/apps/io.github.pjcroft.PCPlan.svg"
install -m 644 "$ROOT/assets/fieldplan-mime.xml" "$STAGE/usr/share/mime/packages/io.github.pjcroft.PCPlan.xml"

cat >"$STAGE/DEBIAN/control" <<EOF
Package: pc-plan
Version: $VERSION
Section: office
Priority: optional
Architecture: $ARCH
Depends: python3, python3-gi, gir1.2-gtk-3.0, gir1.2-webkit2-4.1, poppler-utils, xdg-utils, shared-mime-info
Maintainer: Paul Croft <pjcroft@users.noreply.github.com>
Description: Local desktop project planner with a Gantt chart
 PC Plan is a local editable task grid, linked Gantt chart, Microsoft Project
 import tool, and PDF exporter.
EOF
cat >"$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
update-mime-database /usr/share/mime >/dev/null 2>&1 || true
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
EOF
cat >"$STAGE/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
if [ "$1" = remove ] || [ "$1" = purge ]; then
  update-mime-database /usr/share/mime >/dev/null 2>&1 || true
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
  gtk-update-icon-cache -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi
EOF
chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/postrm"
dpkg-deb --build --root-owner-group "$STAGE" "$PACKAGE"
printf 'Created %s\n' "$PACKAGE"
