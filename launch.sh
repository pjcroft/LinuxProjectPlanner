#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export GSETTINGS_BACKEND=memory
export XDG_CACHE_HOME="$PWD/.runtime/cache"
mkdir -p "$XDG_CACHE_HOME"
exec /usr/bin/python3 desktop.py "$@"
