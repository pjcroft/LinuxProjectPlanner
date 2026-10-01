#!/usr/bin/env bash
# Install a per-user launcher and .fieldplan association. No administrator access is needed.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APPLICATIONS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"
MIME_PACKAGES="$HOME/.local/share/mime/packages"
DESKTOP_FILE="$APPLICATIONS/io.github.pjcroft.Fieldplan.desktop"
ICON_FILE="$ICONS/io.github.pjcroft.Fieldplan.svg"

install -Dm644 "$ROOT/assets/fieldplan.svg" "$ICON_FILE"
install -Dm644 "$ROOT/assets/fieldplan-mime.xml" "$MIME_PACKAGES/io.github.pjcroft.Fieldplan.xml"
mkdir -p "$APPLICATIONS"
{
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Version=1.0' 'Name=Fieldplan' 'Comment=Plan projects with a task grid and Gantt chart'
  printf 'Exec="%s/launch.sh" %%f\n' "$ROOT"
  printf 'Icon=%s\n' "$ICON_FILE"
  printf '%s\n' 'Terminal=false' 'Categories=Office;ProjectManagement;' 'MimeType=application/x-fieldplan;'
} >"$DESKTOP_FILE"

update-mime-database "$HOME/.local/share/mime" 2>/dev/null || true
xdg-mime default io.github.pjcroft.Fieldplan.desktop application/x-fieldplan
update-desktop-database "$APPLICATIONS" 2>/dev/null || true
gtk-update-icon-cache -f "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
printf 'Fieldplan has been added to the application menu. .fieldplan files now open with Fieldplan.\n'
