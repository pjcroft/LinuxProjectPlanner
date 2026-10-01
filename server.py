#!/usr/bin/env python3
"""Loopback-only app service. All persistent state lives beside the source."""

from pathlib import Path
import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote
from datetime import date

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / ".runtime/python"))
PROJECTS = ROOT / "projects"
EXPORTS = ROOT / "exports"
WORK = ROOT / ".runtime/work"
for directory in (PROJECTS, EXPORTS, WORK):
    directory.mkdir(parents=True, exist_ok=True)
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
LAUNCH_FILE = Path(os.environ["FIELDPLAN_OPEN_FILE"]).resolve() if os.environ.get("FIELDPLAN_OPEN_FILE") else None


def slug(name):
    return re.sub(r"[^\w .-]", "", name, flags=re.UNICODE).strip(" .")[:90] or "project"


def safe_file(folder, name, suffix):
    if not isinstance(name, str) or Path(name).name != name or not name.endswith(suffix):
        raise ValueError("Invalid filename.")
    p = folder / name
    if p.is_symlink() or p.resolve().parent != folder.resolve():
        raise ValueError("Invalid file path.")
    return p


def export_filename(name, fallback):
    if name is None:
        return fallback
    if not isinstance(name, str) or Path(name).name != name:
        raise ValueError("Invalid PDF name.")
    stem = slug(Path(name).stem)
    return stem + ".pdf"


def available_export_file(filename):
    candidate = safe_file(EXPORTS, filename, ".pdf")
    if not candidate.exists():
        return candidate
    stem = candidate.stem
    for suffix in range(2, 1000):
        candidate = safe_file(EXPORTS, f"{stem}-{suffix}.pdf", ".pdf")
        if not candidate.exists():
            return candidate
    raise ValueError("Too many PDFs share this name. Choose a different PDF name.")


def validate(p, scheduled=False):
    if (
        not isinstance(p, dict)
        or p.get("format") != "linux-desktop-planner"
        or p.get("version") != 1
    ):
        raise ValueError("Unsupported project format.")
    if not isinstance(p.get("name"), str) or not 1 <= len(p["name"].strip()) <= 200:
        raise ValueError("Project name must be 1–200 characters.")
    date.fromisoformat(p["start"])
    tasks = p["tasks"]
    if not isinstance(tasks, list) or len(tasks) > 1000:
        raise ValueError("Maximum 1,000 tasks per project.")
    ids = set()
    previous = -1
    for i, t in enumerate(tasks):
        if type(t.get("id")) != int or t["id"] < 1 or t["id"] in ids:
            raise ValueError("Invalid or duplicate task ID.")
        ids.add(t["id"])
        if type(t.get("level")) != int or not 0 <= t["level"] <= 12 or t["level"] > previous + 1:
            raise ValueError("Invalid outline.")
        if i and t["level"] > previous and tasks[i - 1]["kind"] != "phase":
            raise ValueError("Only phases can contain tasks.")
        previous = t["level"]
        if t.get("kind") not in ("task", "phase", "milestone"):
            raise ValueError("Invalid task kind.")
        for key, limit in [("name", 300), ("owner", 150)]:
            if not isinstance(t.get(key), str) or len(t[key]) > limit:
                raise ValueError("Invalid task text.")
        if not isinstance(t.get("color"), str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", t["color"]):
            raise ValueError("Invalid color.")
        date.fromisoformat(t["start"])
        if scheduled or t.get("mode") == "manual":
            date.fromisoformat(t["finish"])
            if t["finish"] < t["start"]:
                raise ValueError("Finish is before start.")
        if (
            type(t.get("duration")) not in (int, float)
            or not 0 <= t["duration"] <= 10000
            or (t["kind"] == "task" and t["duration"] <= 0)
        ):
            raise ValueError("Invalid duration.")
        if (
            not isinstance(t.get("deps"), list)
            or any(type(d) != int for d in t["deps"])
            or len(set(t["deps"])) != len(t["deps"])
        ):
            raise ValueError("Invalid predecessors.")
    byid = {t["id"]: t for t in tasks}
    states = {}

    def visit(t):
        if states.get(t["id"]) == 1:
            raise ValueError("Dependency cycle.")
        if states.get(t["id"]) == 2:
            return
        states[t["id"]] = 1
        if t["kind"] == "phase" and t["deps"]:
            raise ValueError("Phases cannot have predecessors.")
        for dep in t["deps"]:
            if dep not in ids or byid[dep]["kind"] == "phase":
                raise ValueError("Invalid predecessor.")
            visit(byid[dep])
        states[t["id"]] = 2

    for t in tasks:
        visit(t)
    return p


def revision(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile(
        "w", dir=PROJECTS, suffix=".tmp", delete=False, encoding="utf-8"
    ) as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
        tmp = Path(f.name)
    try:
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        expected = f"127.0.0.1:{self.server.server_port}"
        return (
            self.headers.get("Host") == expected
            and self.headers.get("Origin", f"http://{expected}") == f"http://{expected}"
            and self.headers.get("Sec-Fetch-Site", "same-origin") not in ("cross-site", "same-site")
        )

    def do_GET(self):
        if not self.allowed():
            return self.reply({"error": "Local requests only."}, 403)
        path = urlparse(self.path).path
        try:
            if path == "/api/session":
                return self.reply({"token": TOKEN})
            if path == "/api/launch-project":
                if not LAUNCH_FILE or not LAUNCH_FILE.is_file() or LAUNCH_FILE.is_symlink():
                    return self.reply({"project": None})
                project = validate(json.loads(LAUNCH_FILE.read_text()))
                return self.reply(
                    {
                        "project": project,
                        "path": str(LAUNCH_FILE),
                        "revision": revision(LAUNCH_FILE),
                    }
                )
            if path == "/api/projects":
                items = []
                for p in PROJECTS.glob("*.fieldplan"):
                    if p.is_symlink():
                        continue
                    try:
                        items.append(
                            {
                                "name": json.loads(p.read_text())["name"],
                                "filename": p.name,
                                "modified": p.stat().st_mtime,
                            }
                        )
                    except (ValueError, KeyError, OSError):
                        continue
                return self.reply(sorted(items, key=lambda i: i["modified"], reverse=True))
            if path.startswith("/exports/"):
                file = safe_file(EXPORTS, unquote(path[len("/exports/") :]), ".pdf")
                mime = "application/pdf"
            else:
                assets = {
                    "/": ("index.html", "text/html"),
                    "/style.css": ("style.css", "text/css"),
                    "/app.mjs": ("app.mjs", "text/javascript"),
                    "/schedule.mjs": ("schedule.mjs", "text/javascript"),
                }
                if path not in assets:
                    return self.reply({"error": "Not found."}, 404)
                filename, mime = assets[path]
                file = ROOT / "app" / filename
            data = file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'",
            )
            self.end_headers()
            self.wfile.write(data)
        except (ValueError, OSError) as e:
            self.reply({"error": str(e)}, 404)

    def do_POST(self):
        if not self.allowed() or not secrets.compare_digest(
            self.headers.get("X-Fieldplan-Token", ""), TOKEN
        ):
            return self.reply({"error": "Invalid local session. Reload the app."}, 403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 42 * 1024 * 1024:
                raise ValueError("Request is too large.")
            data = json.loads(self.rfile.read(length))
            path = urlparse(self.path).path
            if path == "/api/open":
                p = safe_file(PROJECTS, data["filename"], ".fieldplan")
                project = validate(json.loads(p.read_text()))
                return self.reply({"project": project, "revision": revision(p)})
            if path == "/api/save":
                p = validate(data["project"])
                filename = (
                    data.get("filename")
                    or slug(p["name"]) + "-" + uuid.uuid4().hex[:6] + ".fieldplan"
                )
                file = safe_file(PROJECTS, filename, ".fieldplan")
                with LOCK:
                    if file.exists() and data.get("revision") != revision(file):
                        raise ValueError(
                            "This file changed in another window. Open it again before saving, so changes are not overwritten."
                        )
                    atomic_json(file, p)
                    rev = revision(file)
                return self.reply({"filename": filename, "revision": rev})
            if path == "/api/import":
                raw = base64.b64decode(data["content"], validate=True)
                if len(raw) > 30 * 1024 * 1024:
                    raise ValueError("MPP files must be smaller than 30 MB.")
                if not raw.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
                    raise ValueError("This is not a binary Microsoft Project file.")
                with tempfile.TemporaryDirectory(dir=WORK) as temp:
                    file = Path(temp) / (slug(Path(data.get("name", "import.mpp")).stem) + ".mpp")
                    file.write_bytes(raw)
                    result = subprocess.run(
                        [sys.executable, str(ROOT / "mpp_import.py"), str(file)],
                        capture_output=True,
                        text=True,
                        timeout=90,
                        cwd=ROOT,
                    )
                    # Java logging may precede the JSON payload; it never becomes app data.
                    lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
                    if not lines:
                        raise ValueError("MPP reader failed. Check that setup has completed.")
                    imported = json.loads(lines[-1])
                    if result.returncode or "error" in imported:
                        raise ValueError(imported.get("error", "Import failed."))
                    validate(imported["project"])
                    return self.reply(imported)
            if path == "/api/export":
                from pdf_export import export_pdf

                p = validate(data["project"], scheduled=True)
                if not p["tasks"]:
                    raise ValueError("Add tasks before exporting.")
                with LOCK:
                    file = available_export_file(
                        export_filename(data.get("filename"), slug(p["name"]) + ".pdf")
                    )
                    pages = export_pdf(p, data["settings"], file)
                from urllib.parse import quote

                return self.reply(
                    {"filename": file.name, "pages": pages, "url": "/exports/" + quote(file.name)}
                )
            return self.reply({"error": "Not found."}, 404)
        except (
            ValueError,
            KeyError,
            TypeError,
            OSError,
            subprocess.TimeoutExpired,
            RecursionError,
        ) as e:
            self.reply({"error": str(e)}, 400)
        except Exception as e:
            self.reply({"error": "Unable to complete operation: " + str(e)}, 500)


def create_server(port=0):
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    server = create_server(args.port)
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
