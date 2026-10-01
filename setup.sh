#!/usr/bin/env bash
# Keep Python packages, Java, downloads and caches inside this project.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
mkdir -p .runtime/downloads .runtime/pip-cache
export PIP_CACHE_DIR="$PWD/.runtime/pip-cache"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
if [[ ! -x .runtime/java/bin/java ]]; then
  .venv/bin/python - <<'PY'
import hashlib,json,platform,tarfile,urllib.request
from pathlib import Path
arch={'x86_64':'x64','aarch64':'aarch64'}.get(platform.machine())
if not arch:raise SystemExit('Unsupported Java architecture: '+platform.machine())
url=f'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture={arch}&image_type=jre&os=linux&vendor=eclipse'
asset=json.load(urllib.request.urlopen(url))[0]['binary']['package']
p=Path('.runtime/downloads/java.tar.gz');urllib.request.urlretrieve(asset['link'],p)
if hashlib.sha256(p.read_bytes()).hexdigest()!=asset['checksum']:raise SystemExit('Java download checksum mismatch')
root=Path('.runtime/java');root.mkdir(exist_ok=True)
with tarfile.open(p) as archive:
 for member in archive.getmembers():
  parts=Path(member.name).parts
  if len(parts)<2:continue
  member.name=str(Path(*parts[1:]))
  archive.extract(member,root,filter='data')
print('Installed project-local Java 21.')
PY
fi
printf 'Setup complete. Run ./launch.sh to open Fieldplan.\n'
