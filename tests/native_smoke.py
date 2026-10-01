"""Exercise the actual GTK/WebKit frontend, including its JavaScript runtime."""

import sys
import subprocess
from pathlib import Path
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gtk, WebKit2, GLib

ROOT = Path(__file__).resolve().parents[1]
url = sys.argv[1]
window = Gtk.Window()
window.set_default_size(1540, 940)
manager = WebKit2.WebsiteDataManager.new_ephemeral()
context = WebKit2.WebContext.new_with_website_data_manager(manager)
view = WebKit2.WebView.new_with_context(context)
window.add(view)
status = 1


def check():
    def done(obj, result):
        global status
        try:
            text = obj.evaluate_javascript_finish(result).to_string()
            print(text, flush=True)
            if text.startswith("READY:") and int(text.split()[0].split(":")[1]) > 0:
                status = 0

                def snapshot(web, res):
                    try:
                        web.get_snapshot_finish(res).write_to_png(
                            str(ROOT / ".test-results/native-editor.png")
                        )
                    except Exception as error:
                        print("Snapshot:", error)
                    Gtk.main_quit()

                view.get_snapshot(
                    WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snapshot
                )
                return
        except Exception as error:
            print(error, flush=True)
        Gtk.main_quit()

    view.evaluate_javascript(
        "'READY:'+document.querySelectorAll('tr[data-id]').length+' '+document.querySelector('#notice').textContent",
        -1,
        None,
        None,
        None,
        done,
    )
    return False


view.load_uri(url)
window.show_all()
GLib.timeout_add_seconds(5, check)
GLib.timeout_add_seconds(20, lambda: Gtk.main_quit())
Gtk.main()
sys.exit(status)
