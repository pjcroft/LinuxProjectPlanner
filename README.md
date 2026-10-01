# Linux Desktop Planner — Fieldplan

A local Linux desktop planner with an editable task grid, linked Gantt chart, one-way Microsoft Project import, and vector PDF export. Designed for personal project schedules and customer-facing installation plans.

## Open on the current machine

Run `./launch.sh` from the project folder. The dependencies have already been downloaded locally. An imported reference plan is available in **Open project** on this machine; customer files are not included in this repository.

## Install on another Linux machine

Requires Python 3.12 or later, GTK 3, and WebKitGTK 4.1. On Ubuntu/Debian:

```sh
sudo apt install python3 python3-venv python3-gi gir1.2-gtk-3.0 gir1.2-webkit2-4.1
./setup.sh
./launch.sh
```

Setup downloads Python packages and a checksum-verified Eclipse Temurin Java 21 runtime **inside this folder**. Java is used only for MPP import. Normal app use is offline. The interface is local HTML/JavaScript inside a native GTK/WebKit window; no Node, Rust, hosted website, or frontend build is needed.

## Everyday workflow

1. **New project** sets the name and initial date.
2. Add a **Phase**, **Task**, or **Milestone**. Selecting a phase before adding inserts a child; selecting a task inserts its next sibling.
3. Edit task cells. Predecessors are task IDs separated by commas. **More columns** exposes owners, colors, and scheduling mode.
4. Use **Indent / Outdent** for the outline. Phases calculate their dates from children. Collapse a phase with its triangle.
5. Choose **Fit timeline**, Day, Week, or Month. Drag an ordinary task bar or milestone to move it; automatic dependencies may constrain its new date.
6. **Save project** (Ctrl+S) writes a `.fieldplan` JSON file under `projects/`. **Open project** lists saved plans and can read another `.fieldplan` or JSON project.
7. **Export PDF** writes under `exports/`. Choose dates, day/week/month scale, 11 × 17 in (Tabloid), 8.5 × 14 in (Legal), A3, or A4 paper; orientation, columns, compact/comfortable rows, grayscale, and milestone dates.

The app opens the most recently saved plan. Save is explicit; unsaved changes are protected by prompts when switching projects or closing the native window. Undo retains up to 60 edits within the current session. Deleting a phase also removes its children and incoming references, with confirmation and undo.

## Microsoft Project import

**Import plan** reads a binary `.mpp` through [MPXJ](https://www.mpxj.org/howto-start-python/). It preserves named, dated activities, task IDs, outline hierarchy, leaf dates and durations, milestones, basic resource names, and supported finish-to-start links. The original file is never changed.

Imported activities begin in **Fixed dates** mode. This preserves the dates in the source even when its calendar, hours, or link lag differs from the app's simple calendar. Original outline numbers, unique IDs, duration strings, and link descriptions remain in the project’s `source` metadata. Import warnings are displayed and saved with the plan.

Switching a task to **Auto** opts that task into Monday–Friday scheduling: durations round up to whole working days, finish-to-start successors start on the next weekday, and the entered start acts as an earliest start constraint. Moving a predecessor earlier does not automatically erase a later manually entered earliest start. No holiday calendar is implemented. Phase duration is the inclusive weekday span of its children, so it can differ from a source summary duration.

Blank spacer rows and undated activities are omitted. MPP visual formatting is replaced with an app palette. Unsupported relation types, lag, custom calendars, hours, constraints, resource leveling, and percent-complete progress are not calculated. Non-FS links are retained as metadata with warnings; lag on an imported FS link is retained as metadata but not applied in Auto mode. No MPP export.

## PDF layout

Exports are vector pages with embedded DejaVu fonts when installed. A task table sits beside the chart; quarter/month headings, selected scale ticks, phase bars, milestones, owners, and dependency arrows are drawn directly. Long timelines split horizontally with the table repeated; rows paginate vertically. A predecessor on another row page is identified by task ID. The export uses all project tasks, including collapsed children. Long labels may be ellipsized to keep the layout clean.

## Files and privacy

- `app/`: interface and calendar engine
- `desktop.py`, `launch.sh`: native window and launcher
- `server.py`: loopback-only file/import/export service, session-token protected
- `mpp_import.py`: isolated MPXJ reader process
- `pdf_export.py`: dedicated PDF renderer
- `projects/`, `exports/`: personal work, ignored by Git
- `.runtime/`, `.venv/`: local dependencies and caches, ignored by Git
- `tests/`: calendar, storage, browser, native-window, and PDF checks

Only source and documentation belong on GitHub. `.mpp`, `.pdf`, `.fieldplan`, reference material, runtime downloads, test screenshots, and local credentials are ignored. Saved files use atomic replacement and conflict detection to avoid overwriting edits from another window. The app is intended for one local user, not deployment as an internet service.

## Development and tests

```sh
node --test tests/schedule.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 server.py --port 8765
```

Browser smoke testing additionally requires Playwright and Chromium; set `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` if not on their normal paths. The optional real-file workflow uses `MPP_TEST_FILE` to point to a local MPP. Run `node tests/ui-smoke.cjs` against the running service. `python3 tests/native_smoke.py http://127.0.0.1:8765` checks GTK/WebKit rendering. See `docs/VALIDATION.md` for what was verified on the original machine and known limits.

## Next improvements

- Working calendars, holidays, dependency types and lag, with an import review screen.
- Search/filter, movable rows, richer task details, and keyboard navigation.
- Linux packaging and an installable desktop launcher.

This is an initial working release, not a replacement for every Microsoft Project feature.

### Git on the original workspace

The Codex workspace reserves its `.git` folder as read-only. Git metadata therefore lives in `.runtime/repository.git`; use `./project-git.sh status`, `./project-git.sh log`, and the usual Git subcommands through that wrapper here. A normal clone from GitHub uses standard `git` commands.
