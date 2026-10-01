# Initial release validation — 2026-10-01

## Passed

- Seven calendar/outline tests: weekday and DST/year-boundary arithmetic, dependency propagation, nested phase rollups and collapse, cycle and invalid-predecessor rejection, fixed weekend dates with fractional duration, invalid outlines/dates, and source-model immutability.
- Four service tests: atomic save/open, stale-revision conflict rejection, path traversal rejection, foreign-origin/session rejection, and invalid-format rejection.
- Two PDF checks: every activity appears across vertical pages with correct page counts; long day-scale timelines paginate horizontally on portrait paper.
- Chromium browser workflow: blank project, nested phase/task/milestone creation, editing, dependency calculation, cycle rejection with rollback, collapse/expand, undo, extra columns, local save/reload, actual binary MPP import, and PDF export. No browser JavaScript errors.
- Native GTK/WebKit smoke test: the actual desktop engine loaded and rendered the 49 imported activities. Its screenshot was inspected.
- The supplied real MPP was read with MPXJ 16.9.0. It yielded 49 named, dated activities and eight finish-to-start links. Source files were not edited. The imported local project is saved separately under `projects/`.
- A compact, single-page A3 landscape export from that plan was rendered and visually inspected. A two-page Legal export was also inspected before adding compact spacing. Both use actual vector PDF layout, not screenshots.

## Limits of this validation

The real-file import was checked against one supplied MPP. It is not a broad compatibility certification for arbitrary versions/calendars. JavaScript interaction coverage runs in Chromium; the native WebKit test verifies load/render, not every native file-dialog interaction. Setup was assembled from downloaded project-local dependencies on the development machine; a clean-machine setup has not yet been exercised. Packaging as a .deb/AppImage is not implemented.

Source dates are intentionally fixed on import. Auto scheduling does not model holidays, time-of-day, advanced dependency types, lag, leveling, or Microsoft Project constraints. Summary durations are weekday spans and can differ from the imported plan's original calendar duration. Import does not preserve custom visual formatting.

PDFs repeat all tasks for each horizontal time slice. Long cell labels use ellipses; dependency references crossing row pages use IDs. Rows are paginated in order rather than keeping every phase and all its children on the same page.
