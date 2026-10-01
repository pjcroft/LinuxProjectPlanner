# Architecture and revision notes

The first release deliberately has no frontend build pipeline. Native ES modules keep the schedule engine independently testable; GTK/WebKit provides the Linux window using packages already installed on the original machine. This avoids tying ordinary launch to a development server, browser application mode, or a Node toolchain.

The native shell starts a Python loopback service on a random port and closes it with the window. The browser-only development service is optional. The service serves only explicitly listed app assets and generated PDFs, rejects foreign origins/hosts, and requires a random per-process token for mutations. Source checkouts keep local data beside the source. The installed Debian package keeps each user's projects, exports, previews, and WebKit data in `~/.local/share/pc-plan/`.

`app/schedule.mjs` validates a versioned project, clones it, and computes leaf schedules using a dependency traversal. Phases roll up children; cycles and phase-to-task links are rejected. Fixed-date tasks preserve their original span. The editable model and computed view are separate: saving does not quietly rewrite input constraints. PDF export receives the computed view.

MPP parsing happens in a bounded subprocess, with a 90-second timeout and a 512 MB Java heap. MPXJ is an external library, not app-owned code. Its Python package and all Java libraries remain in the local runtime, and their bundled licenses must be retained if a packaged release redistributes them. ReportLab and GTK/WebKit are similarly third-party dependencies. No end-user license has been selected for the project's own source yet.

Storage is version-1 human-readable JSON with opaque filenames, atomic replacement, and SHA-256 revision checks. A caller with a stale revision gets an error instead of overwriting the file. There is no cloud sync or telemetry. GitHub is for source revisions only.

A future Tauri shell can reuse `app/` and the project format. Replacing the desktop shell is a packaging choice, not required to improve the scheduling engine or document layout. `build-deb.sh` produces an AMD64 Debian package with the app, its Python/Java import and PDF runtime, desktop-menu entry, icon, and `.pln` MIME association. Native GTK/WebKit libraries remain ordinary Ubuntu dependencies.
