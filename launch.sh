#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export GSETTINGS_BACKEND=memory
# Ubuntu's current WebKitGTK build can crash during Mesa/EGL GPU cleanup on this
# machine. PC Plan is a document editor, so software compositing is reliable
# and has no material effect on its task-grid or Gantt-chart experience.
export WEBKIT_DISABLE_COMPOSITING_MODE=1
if [[ "$PWD" == "/usr/lib/pc-plan" ]]; then
  export PC_PLAN_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/pc-plan"
  mkdir -p "$PC_PLAN_DATA_HOME"
  export XDG_CACHE_HOME="$PC_PLAN_DATA_HOME/.runtime/cache"
else
  export XDG_CACHE_HOME="$PWD/.runtime/cache"
fi
mkdir -p "$XDG_CACHE_HOME"
export PYTHONPATH="$PWD/.runtime/python${PYTHONPATH:+:$PYTHONPATH}"
exec /usr/bin/python3 desktop.py "$@"
