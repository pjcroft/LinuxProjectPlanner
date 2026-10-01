#!/usr/bin/env python3
"""Native GTK application window; uses the system's maintained WebKit engine."""

import os
import signal
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse, unquote
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2, GLib

ROOT = Path(__file__).resolve().parent


def python_runtime():
    local = ROOT / ".venv/bin/python"
    bundled = (
        Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
    )
    for p in [local, bundled]:
        if p.exists():
            return str(p)
    return sys.executable


service = subprocess.Popen(
    [python_runtime(), str(ROOT / "server.py")], cwd=ROOT, stdout=subprocess.PIPE, text=True
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
view.get_settings().set_enable_developer_extras(False)
window.add(view)
closing = False


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
view.connect("decide-policy", policy)
view.load_uri(url)
window.show_all()
try:
    Gtk.main()
finally:
    if service.poll() is None:
        service.terminate()
