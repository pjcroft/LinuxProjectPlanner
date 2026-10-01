#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export GSETTINGS_BACKEND=memory
# Ubuntu's current WebKitGTK build can crash during Mesa/EGL GPU cleanup on this
# machine. Fieldplan is a document editor, so software compositing is reliable
# and has no material effect on its task-grid or Gantt-chart experience.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export XDG_CACHE_HOME="$PWD/.runtime/cache"
mkdir -p "$XDG_CACHE_HOME"
exec /usr/bin/python3 desktop.py "$@"
