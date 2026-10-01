# PC Plan continuation guide

This document records the working baseline after the initial desktop release. Start here before changing PC Plan so new work preserves the decisions that are already tested.

## Product identity

- Application name: **PC Plan**
- Desktop application ID: `io.github.pjcroft.PCPlan`
- Project extension: `.pln`
- Legacy projects: `.fieldplan` files still open, but new saves use `.pln`
- Main repository: `https://github.com/pjcroft/LinuxProjectPlanner`
- Current source baseline: commit `0c279e0` (`Package PC Plan for Ubuntu`)

The visual theme uses a charcoal sidebar, a teal PC logo, and gold (`#eeb85d`) for actions and accents. The sidebar logo and PC PLAN label are centered; the label uses a bold monospace font. The task grid, date fields, dropdowns, and Gantt labels were enlarged for readability.

## Completed capabilities

- Start with a clean untitled project; New project asks for its name, starting date, and save location.
- Save project and Save as project use native Linux file dialogs. Save tracks revisions to avoid overwriting another window's newer version.
- Open `.pln`, legacy `.fieldplan`, and supported JSON project files.
- Add phases, tasks, and milestones; indent and outdent the outline; collapse phase rows; undo edits.
- Edit task name, duration, dates, owner, color, and scheduling mode. Weekday abbreviations appear before the start and finish dates.
- Create a finish-to-start dependency by selecting a predecessor, Ctrl-clicking a successor, then using the right-click menu. The successor and its downstream chain move when a predecessor moves. Linked tasks can be detached with **Break dependency**.
- Display the project as an editable table and Gantt chart. **Fit timeline** expands the timeline to the available window width and refreshes after window resizing.
- Import Microsoft Project `.mpp` files through MPXJ. Imported tasks begin in fixed-date mode to preserve the original dates.
- Export vector PDFs with preview, custom PDF title/name, native save location, Tabloid (11 × 17 in), Legal (8.5 × 14 in), A3, and A4 paper choices.
- Register PC Plan in the Linux application menu and associate `.pln` files.

## Layout and code map

| Location | Purpose |
| --- | --- |
| `app/index.html` | Application shell and controls |
| `app/app.mjs` | UI state, actions, Gantt drawing, dialogs |
| `app/schedule.mjs` | Project validation, scheduling, dependencies, phase rollups |
| `app/style.css` | PC Plan visual theme and responsive layout |
| `desktop.py` | GTK/WebKit window and native save/open bridge |
| `server.py` | Local authenticated HTTP service, project storage, previews, exports |
| `mpp_import.py` | MPXJ/Java MPP import bridge |
| `pdf_export.py` | Vector PDF renderer |
| `assets/` | App icon and MIME definition |
| `build-deb.sh` | Builds the Ubuntu/Debian package |

## Local development and releases

Run the app from a source checkout with `./launch.sh`.

Build the current Ubuntu installer with:

```sh
./build-deb.sh 0.1.0
```

The package is written to `dist/pc-plan_0.1.0_amd64.deb`. It is intentionally ignored by Git; GitHub stores source and release-building instructions rather than a large generated binary. The installed package uses `/usr/lib/pc-plan` for read-only program files and `~/.local/share/pc-plan/` for each user's data.

On a 64-bit Ubuntu/Debian laptop, install the package with:

```sh
sudo apt install ./pc-plan_0.1.0_amd64.deb
```

Run the relevant checks after a change:

```sh
node --test tests/schedule.test.mjs
python3 -m unittest tests.test_pdf -v
python3 -m py_compile desktop.py server.py
./project-git.sh diff --check
```

The workspace uses `project-git.sh` because its normal Git directory is reserved by the environment. A normal clone can use ordinary `git` commands. Do not commit `projects/`, `exports/`, `.runtime/`, `dist/`, or customer files.

## Known boundaries and sensible next work

- Auto scheduling is Monday–Friday only; it does not yet model holidays, lag, non-finish-to-start dependency types, resource leveling, or full Microsoft Project constraints.
- The MPP importer is one-way. It preserves supported data and source metadata but does not export back to `.mpp`.
- The Debian package is AMD64-only. Test it on the laptop before treating it as a broad release. An AppImage, Flatpak, release attachment, or ARM64 package can be added later.
- The package's native save dialogs, desktop-menu integration, and `.pln` double-click association should be exercised on the laptop as the next practical test.
- Continue using PDF preview before final exports when changing paper sizes, columns, or timeline range.
