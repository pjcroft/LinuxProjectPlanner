#!/usr/bin/env python3
"""Native GTK application window; uses the system's maintained WebKit engine."""

import os
import signal
import subprocess
import sys
import json
import tempfile
from pathlib import Path
from urllib.parse import urlparse, unquote
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2, GLib

from server import revision, validate

ROOT = Path(__file__).resolve().parent
opened_project = None
if len(sys.argv) > 1:
    candidate = Path(sys.argv[1]).expanduser()
    if candidate.suffix.lower() == ".fieldplan" and candidate.is_file() and not candidate.is_symlink():
        opened_project = candidate.resolve()


def python_runtime():
    local = ROOT / ".venv/bin/python"
    bundled = (
        Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
    )
    for p in [local, bundled]:
        if p.exists():
            return str(p)
    return sys.executable


service_environment = os.environ.copy()
if opened_project:
    service_environment["FIELDPLAN_OPEN_FILE"] = str(opened_project)
service = subprocess.Popen(
    [python_runtime(), str(ROOT / "server.py")],
    cwd=ROOT,
    stdout=subprocess.PIPE,
    text=True,
    env=service_environment,
)
url = service.stdout.readline().strip()
if not url.startswith("http://127.0.0.1:"):
    raise RuntimeError("The local planner service could not start.")
window = Gtk.Window(title="Fieldplan · Linux Desktop Planner")
window.set_default_size(1540, 940)
window.set_position(Gtk.WindowPosition.CENTER)
manager = WebKit2.WebsiteDataManager(
    base_data_directory=str(ROOT / ".runtime/webkit/data"),
    base_cache_directory=str(ROOT / ".runtime/webkit/cache"),
)
context = WebKit2.WebContext.new_with_website_data_manager(manager)
view = WebKit2.WebView.new_with_context(context)
content_manager = view.get_user_content_manager()
view.get_settings().set_enable_developer_extras(False)
window.add(view)
closing = False
native_project_paths = set()
if opened_project:
    native_project_paths.add(str(opened_project))


def reply_to_save_request(data):
    script = "window.fieldplanNativeSaveResult(" + json.dumps(data) + ");"
    view.evaluate_javascript(script, -1, None, None, None, None)


def write_chosen_project(path, project):
    validate(project)
    path = Path(path)
    if path.suffix.lower() != ".fieldplan":
        path = path.with_suffix(".fieldplan")
    if not path.parent.is_dir():
        raise ValueError("Choose an existing folder for the project.")
    with tempfile.NamedTemporaryFile(
        "w", dir=path.parent, suffix=".tmp", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(project, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    native_project_paths.add(str(path))
    return path


def save_to_path(path, project):
    try:
        path = write_chosen_project(path, project)
        reply_to_save_request({"path": str(path), "revision": revision(path)})
    except (OSError, ValueError) as error:
        reply_to_save_request({"error": str(error)})


def choose_save_path(project, suggested_name):
    # Use GTK's own dialog rather than the desktop portal wrapper. The portal
    # occasionally returns without showing a window on this Ubuntu release.
    chooser = Gtk.FileChooserDialog(
        title="Save project as",
        parent=window,
        action=Gtk.FileChooserAction.SAVE,
    )
    chooser.add_buttons("Cancel", Gtk.ResponseType.CANCEL, "Save project", Gtk.ResponseType.ACCEPT)
    chooser.set_do_overwrite_confirmation(True)
    chooser.set_current_folder(str(ROOT / "projects"))
    suggested = Path(str(suggested_name or "project")).name
    chooser.set_current_name((suggested.removesuffix(".fieldplan") or "project") + ".fieldplan")

    def chosen(dialog, response):
        try:
            if response == Gtk.ResponseType.ACCEPT:
                save_to_path(dialog.get_filename(), project)
            else:
                reply_to_save_request({"error": "Save cancelled."})
        finally:
            dialog.destroy()

    chooser.connect("response", chosen)
    chooser.show_all()


def native_message(manager, message):
    try:
        payload = message.get_js_value().to_string()
        request = json.loads(payload)
        action = request.get("action")
        project = request.get("project")
        print("Fieldplan native save request:", action, flush=True)
        if action == "save-as":
            choose_save_path(project, request.get("suggestedName"))
        elif action == "save" and request.get("path") in native_project_paths:
            save_to_path(request["path"], project)
        else:
            reply_to_save_request({"error": "Choose Save as project to select a file."})
    except (AttributeError, TypeError, ValueError, json.JSONDecodeError) as error:
        print("Fieldplan native save error:", error, flush=True)
        reply_to_save_request({"error": "Unable to save project: " + str(error)})


def destroy(*args):
    service.terminate()
    try:
        service.wait(timeout=4)
    except subprocess.TimeoutExpired:
        service.kill()
    Gtk.main_quit()


def on_close(widget, event):
    global closing
    if closing:
        return False

    def checked(obj, result):
        global closing
        try:
            value = obj.evaluate_javascript_finish(result)
            can_close = value.to_boolean()
        except Exception:
            can_close = False
        if not can_close:
            dlg = Gtk.MessageDialog(
                transient_for=window,
                modal=True,
                message_type=Gtk.MessageType.QUESTION,
                buttons=Gtk.ButtonsType.NONE,
                text="Close without saving?",
            )
            dlg.format_secondary_text(
                "Your project has unsaved changes. Return to the editor and choose Save project to keep them."
            )
            dlg.add_button("Keep editing", Gtk.ResponseType.CANCEL)
            dlg.add_button("Discard and close", Gtk.ResponseType.OK)
            response = dlg.run()
            dlg.destroy()
            if response != Gtk.ResponseType.OK:
                return
        closing = True
        window.destroy()

    view.evaluate_javascript(
        "window.fieldplanCanClose ? window.fieldplanCanClose() : true",
        -1,
        None,
        None,
        None,
        checked,
    )
    return True


def policy(web, decision, kind):
    if kind not in (
        WebKit2.PolicyDecisionType.NAVIGATION_ACTION,
        WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION,
    ):
        return False
    uri = decision.get_navigation_action().get_request().get_uri()
    parsed = urlparse(uri)
    if uri.startswith(url + "/exports/"):
        name = unquote(parsed.path[len("/exports/") :])
        file = ROOT / "exports" / name
        if file.is_file() and file.resolve().parent == (ROOT / "exports").resolve():
            subprocess.Popen(
                ["xdg-open", str(file)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        decision.ignore()
        return True
    if not uri.startswith(url + "/") and uri != url:
        decision.ignore()
        return True
    return False


window.connect("delete-event", on_close)
window.connect("destroy", destroy)
content_manager.connect("script-message-received::fieldplan", native_message)
if not content_manager.register_script_message_handler("fieldplan"):
    raise RuntimeError("The native Save as project bridge could not start.")
view.connect("decide-policy", policy)
view.load_uri(url)
window.show_all()
try:
    Gtk.main()
finally:
    if service.poll() is None:
        service.terminate()
