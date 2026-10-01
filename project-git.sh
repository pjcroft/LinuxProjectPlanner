#!/usr/bin/env bash
# This workspace reserves .git as read-only; keep metadata in the project-local runtime.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec git --git-dir="$PWD/.runtime/repository.git" --work-tree="$PWD" "$@"
