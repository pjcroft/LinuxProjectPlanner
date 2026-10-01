import {
  DAY,
  date,
  iso,
  plus,
  shift,
  workday,
  durationBetween,
  schedule,
  visible,
  blank,
  demo,
} from "./schedule.mjs";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let project = demo(),
  filename = null,
  dirty = false,
  selected = null,
  collapsed = new Set(),
  history = [],
  scale = "fit",
  details = false,
  token = "",
  savedRevision = null;
const notify = (s) => {
  $("#notice").textContent = s;
  $("#notice").style.display = "block";
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("#notice").style.display = "none"), 6500);
};
async function api(path, data) {
  const r = await fetch(path, {
    method: data ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Fieldplan-Token": token },
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Unable to complete request.");
  return j;
}
function mutate(fn) {
  const old = structuredClone(project);
  try {
    fn();
    schedule(project);
    history.push(old);
    if (history.length > 60) history.shift();
    dirty = true;
    render();
  } catch (e) {
    project = old;
    notify(e.message);
    render();
  }
}
function modal(html) {
  $("#dialogContent").innerHTML = html;
  $("#dialog").showModal();
  $("#dialog")
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => $("#dialog").close()));
}
const close = () => $("#dialog").close();
async function abandon() {
  if (!dirty) return true;
  return new Promise((resolve) => {
    modal(
      '<h2>Keep your changes?</h2><p>This project has unsaved changes. Save it before switching, or discard those changes.</p><div class="buttons"><button id="keep">Keep editing</button><button id="discard">Discard changes</button><button class="primary" id="saveSwitch">Save & continue</button></div>',
    );
    const dlg = $("#dialog");
    const cancel = (e) => {
      e.preventDefault();
      close();
      resolve(false);
    };
    dlg.addEventListener("cancel", cancel, { once: true });
    const done = (v) => {
      dlg.removeEventListener("cancel", cancel);
      close();
      resolve(v);
    };
    $("#keep").onclick = () => done(false);
    $("#discard").onclick = () => done(true);
    $("#saveSwitch").onclick = async () => {
      if (await save()) done(true);
    };
  });
}
function load(p, file = null, revision = null) {
  schedule(p);
  project = p;
  filename = file;
  savedRevision = revision;
  selected = null;
  history = [];
  collapsed.clear();
  dirty = false;
  render();
}
function render() {
  const all = schedule(project),
    rows = visible(all, collapsed);
  $("#projectName").value = project.name;
  $("#projectStart").value = project.start;
  $("#status").textContent = dirty
    ? "Unsaved changes"
    : filename
      ? "Saved locally · " + filename
      : "Example · save to keep";
  $("#taskCount").textContent = all.filter((t) => t.kind === "task").length;
  $("#milestoneCount").textContent = all.filter(
    (t) => t.kind === "milestone",
  ).length;
  $("#endDate").textContent = all.length
    ? all.reduce((a, t) => (a > t.finish ? a : t.finish), all[0].finish)
    : "—";
  $("#selection").textContent = selected
    ? `Selected task ${selected} · ${project.tasks.find((t) => t.id === selected)?.mode === "manual" ? "Fixed dates" : "Automatic scheduling"}`
    : "No row selected";
  $("#undo").disabled = !history.length;
  ["delete", "indent", "outdent", "mode"].forEach((id) => {
    if ($("#" + id)) $("#" + id).disabled = !selected;
  });
  const container = $("#schedule"),
    scroll = [container.scrollLeft, container.scrollTop];
  if (!rows.length) {
    container.innerHTML =
      '<div class="empty"><strong>Your next project starts here.</strong>Add a phase, task, or milestone using the toolbar above.</div>';
    return;
  }
  const colWidths = details
    ? [36, 255, 65, 106, 106, 75, 104, 43, 90]
    : [36, 255, 65, 106, 106, 75, 0, 0, 0];
  container.innerHTML = `<div class="schedule-inner"><table class="${details ? "expanded" : "compact"}" style="width:${colWidths.reduce((a, b) => a + b, 0)}px"><colgroup>${colWidths.map((w) => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr>${["ID", "Task name", "Days", "Start", "Finish", "Predecessors", "Owner", "Color", "Scheduling"].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((t) => `<tr data-id="${t.id}" class="${t.kind === "phase" ? "phase " : ""}${selected === t.id ? "selected" : ""}"><td>${t.id}</td><td><div class="task-name" style="padding-left:${t.level * 14}px">${t.kind === "phase" ? `<button class="collapse" data-collapse="${t.id}" aria-label="${collapsed.has(t.id) ? "Expand" : "Collapse"} ${esc(t.name)}">${collapsed.has(t.id) ? "▸" : "▾"}</button>` : `<span class="task-icon">${t.kind === "milestone" ? "◆" : "—"}</span>`}<input data-key="name" aria-label="Task ${t.id} name" value="${esc(t.name)}"></div></td><td><input data-key="duration" aria-label="Task ${t.id} duration" type="number" min="0.01" max="10000" step="any" value="${t.duration}" ${t.kind !== "task" ? "disabled" : ""}></td><td><input data-key="start" aria-label="Task ${t.id} start" type="date" value="${t.start}" ${t.kind === "phase" ? "disabled" : ""}></td><td><input data-key="finish" aria-label="Task ${t.id} finish" type="date" value="${t.finish}" ${t.kind !== "task" ? "disabled" : ""}></td><td><input data-key="deps" aria-label="Task ${t.id} predecessors" value="${t.deps.join(", ")}" ${t.kind === "phase" ? "disabled" : ""}></td><td><input data-key="owner" aria-label="Task ${t.id} owner" value="${esc(t.owner)}"></td><td><input data-key="color" aria-label="Task ${t.id} color" type="color" value="${t.color}"></td><td><select data-key="mode" aria-label="Task ${t.id} scheduling" ${t.kind === "phase" ? "disabled" : ""}><option value="auto" ${t.mode !== "manual" ? "selected" : ""}>Auto</option><option value="manual" ${t.mode === "manual" ? "selected" : ""}>Fixed dates</option></select></td></tr>`).join("")}</tbody></table><div class="gantt">${gantt(rows, all)}</div></div>`;
  container.scrollLeft = scroll[0];
  container.scrollTop = scroll[1];
  container.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => {
      selected = +tr.dataset.id;
      container
        .querySelectorAll("tr.selected")
        .forEach((e) => e.classList.remove("selected"));
      tr.classList.add("selected");
      $("#selection").textContent = `Selected task ${selected}`;
      ["delete", "indent", "outdent"].forEach(
        (id) => ($("#" + id).disabled = false),
      );
    });
    tr.querySelectorAll("[data-key]").forEach(
      (input) =>
        (input.onchange = () => {
          selected = +tr.dataset.id;
          const k = input.dataset.key,
            v = input.value;
          mutate(() => {
            const t = project.tasks.find((t) => t.id === selected),
              computed = all.find((t) => t.id === selected);
            if (k === "deps") {
              if (v.trim() && !/^\d+(\s*,\s*\d+)*$/.test(v.trim()))
                throw Error("Enter predecessor IDs separated by commas.");
              t.deps = v.trim() ? v.split(",").map(Number) : [];
            } else if (k === "duration") {
              t.duration = Number(v);
              if (t.mode === "manual")
                t.finish = shift(
                  t.start,
                  Math.max(0, Math.ceil(t.duration) - 1),
                );
            } else if (k === "finish") {
              date(v);
              t.duration = durationBetween(computed.start, v);
              if (t.mode === "manual") t.finish = v;
            } else if (k === "start") {
              date(v);
              t.start = v;
              if (t.mode === "manual")
                t.finish =
                  t.kind === "milestone"
                    ? v
                    : shift(v, Math.max(0, Math.ceil(t.duration) - 1));
            } else if (k === "mode") {
              t.mode = v;
              t.start = computed.start;
              t.finish = computed.finish;
            } else t[k] = v;
          });
        }),
    );
  });
  container.querySelectorAll("[data-collapse]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const id = +b.dataset.collapse;
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        render();
      }),
  );
  container.querySelectorAll("[data-bar]").forEach((el) => {
    el.style.cursor = "ew-resize";
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      const id = +el.dataset.bar,
        t = all.find((t) => t.id === id),
        x = e.clientX,
        unit = +el.dataset.unit;
      el.setPointerCapture(e.pointerId);
      el.onpointerup = (up) => {
        const days = Math.round((up.clientX - x) / unit);
        if (days)
          mutate(() => {
            const raw = project.tasks.find((r) => r.id === id);
            raw.start = plus(t.start, days);
            if (raw.mode === "manual") raw.finish = plus(t.finish, days);
          });
        el.onpointerup = null;
      };
    };
  });
}
function gantt(rows, all) {
  const earliest = all.reduce(
      (a, t) => (a < t.start ? a : t.start),
      all[0].start,
    ),
    latest = all.reduce((a, t) => (a > t.finish ? a : t.finish), all[0].finish),
    start = plus(earliest, -3),
    end = plus(latest, 14),
    count = Math.round((date(end) - date(start)) / DAY) + 1;
  const available = Math.max(
    440,
    $("#schedule").clientWidth - (details ? 880 : 643),
  );
  const unit = Math.min(
      scale === "fit"
        ? (available - 90) / count
        : { day: 32, week: 15, month: 5 }[scale],
      16000 / count,
    ),
    width = Math.max(available, count * unit + 90),
    height = 58 + rows.length * 42,
    x = (s) => ((date(s) - date(start)) / DAY) * unit;
  let grid = "",
    ticks = "",
    months = "";
  let monthStart = 0;
  for (let i = 0; i < count; i++) {
    const s = plus(start, i),
      d = date(s),
      px = i * unit;
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6)
      grid += `<rect x="${px}" y="58" width="${unit}" height="${height - 58}" fill="#f6f8f5"/>`;
    if (
      (scale === "day" && unit >= 20) ||
      (scale === "week" && d.getUTCDay() === 1) ||
      ((scale === "month" || scale === "fit") && d.getUTCDate() === 1)
    ) {
      ticks += `<path d="M${px} 31V${height}" stroke="#e5ebe5"/><text x="${px + 4}" y="48" fill="#849487" font-size="9">${scale === "month" || scale === "fit" ? "Q" + (Math.floor(d.getUTCMonth() / 3) + 1) : d.getUTCDate()}</text>`;
    }
    if (i === 0 || d.getUTCDate() === 1) {
      monthStart = px;
      const nextMonth = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
      );
      if (((nextMonth - d) / DAY) * unit > 58)
        months += `<text x="${monthStart + 7}" y="20" fill="#5e7769" font-size="10" font-weight="600">${d.toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}</text>`;
    }
  }
  let lines = "",
    bars = "",
    arrows = "";
  const pos = new Map(rows.map((t, i) => [t.id, i]));
  rows.forEach((t, i) => {
    const y = 58 + i * 42,
      xx = x(t.start),
      w = Math.max(4, x(t.finish) + unit - xx);
    lines += `<path d="M0 ${y + 42}H${width}" stroke="#edf1ed"/>`;
    if (t.kind === "phase") {
      bars += `<path d="M${xx} ${y + 17}h${w}v8l-4 -4H${xx + 4}l-4 4Z" fill="#2c4f43"/>`;
    } else if (t.kind === "milestone") {
      bars += `<path data-bar="${t.id}" data-unit="${unit}" d="M${xx + unit / 2} ${y + 14}l7 7 -7 7 -7 -7Z" fill="${t.color}"/><text x="${xx + unit / 2 + 12}" y="${y + 24}" font-size="9" fill="#62796c">${t.start.slice(5)}</text>`;
    } else {
      bars += `<rect data-bar="${t.id}" data-unit="${unit}" x="${xx}" y="${y + 13}" width="${w}" height="16" rx="3" fill="${t.color}"/><text x="${xx + w + 6}" y="${y + 24}" font-size="10" fill="#64766a">${esc(t.owner || t.name)}</text>`;
    }
    for (const dep of t.deps) {
      if (!pos.has(dep)) continue;
      const p = all.find((a) => a.id === dep),
        sx = x(p.finish) + unit,
        sy = 58 + pos.get(dep) * 42 + 21,
        ex = xx,
        ey = y + 21,
        mid = Math.max(sx + 7, ex - 8);
      arrows += `<path d="M${sx} ${sy}H${mid}V${ey}H${ex}" fill="none" stroke="#9aaca0" stroke-width="1" marker-end="url(#arrow)"/>`;
    }
  });
  return `<svg class="chart-header" width="${width}" height="58" aria-hidden="true"><rect width="${width}" height="58" fill="#f7f9f7"/>${ticks}<rect width="${width}" height="31" fill="#f7f9f7"/>${months}<path d="M0 58H${width}" stroke="#dce4df"/></svg><svg width="${width}" height="${height - 58}" role="img" aria-label="Project Gantt timeline"><defs><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#9aaca0"/></marker></defs><g transform="translate(0,-58)">${grid}${ticks}${lines}${arrows}${bars}</g></svg>`;
}
function add(kind) {
  mutate(() => {
    const id = Math.max(0, ...project.tasks.map((t) => t.id)) + 1;
    const current = project.tasks.findIndex((t) => t.id === selected);
    let index = project.tasks.length,
      level = 0;
    if (current >= 0) {
      const t = project.tasks[current];
      level = t.kind === "phase" ? t.level + 1 : t.level;
      index = current + 1;
      if (t.kind === "phase")
        while (
          index < project.tasks.length &&
          project.tasks[index].level > t.level
        )
          index++;
    }
    project.tasks.splice(index, 0, {
      id,
      name:
        kind === "phase"
          ? "New phase"
          : kind === "milestone"
            ? "New milestone"
            : "New task",
      kind,
      level,
      start: project.start,
      duration: kind === "milestone" ? 0 : 1,
      deps: [],
      owner: "",
      color: "#387f78",
    });
    selected = id;
  });
}
async function save() {
  try {
    const result = await api("/api/save", {
      project,
      filename,
      revision: savedRevision,
    });
    filename = result.filename;
    savedRevision = result.revision;
    dirty = false;
    render();
    notify("Saved in projects/" + filename);
    return true;
  } catch (e) {
    notify(e.message);
    return false;
  }
}
$("#save").onclick = save;
$("#undo").onclick = () => {
  if (history.length) {
    project = history.pop();
    if (!project.tasks.some((t) => t.id === selected)) selected = null;
    dirty = true;
    render();
  }
};
$("#projectName").onchange = (e) =>
  mutate(() => {
    project.name = e.target.value.trim() || "Untitled project";
  });
$("#projectStart").onchange = (e) =>
  mutate(() => {
    date(e.target.value);
    project.start = workday(e.target.value);
    notify("Project start updated. Existing task dates are kept.");
  });
$("#addTask").onclick = () => add("task");
$("#addPhase").onclick = () => add("phase");
$("#addMilestone").onclick = () => add("milestone");
$("#scale").onchange = (e) => {
  scale = e.target.value;
  render();
};
$("#details").onclick = () => {
  details = !details;
  $("#details").textContent = details ? "Fewer columns" : "More columns";
  render();
};
function subtree(index) {
  let end = index + 1;
  while (
    end < project.tasks.length &&
    project.tasks[end].level > project.tasks[index].level
  )
    end++;
  return end;
}
$("#indent").onclick = () =>
  mutate(() => {
    const i = project.tasks.findIndex((t) => t.id === selected);
    if (i <= 0) throw Error("Select a task after a phase to indent it.");
    let prev = i - 1;
    while (prev >= 0 && project.tasks[prev].level > project.tasks[i].level)
      prev--;
    if (
      prev < 0 ||
      project.tasks[prev].kind !== "phase" ||
      project.tasks[prev].level !== project.tasks[i].level
    )
      throw Error("The previous item at this level must be a phase.");
    const end = subtree(i);
    for (let j = i; j < end; j++) project.tasks[j].level++;
  });
$("#outdent").onclick = () =>
  mutate(() => {
    const i = project.tasks.findIndex((t) => t.id === selected);
    if (i < 0 || project.tasks[i].level === 0)
      throw Error("This task is already at the top level.");
    const end = subtree(i);
    if (
      end < project.tasks.length &&
      project.tasks[end].level === project.tasks[i].level
    )
      throw Error(
        "Outdent the last item in a phase first, to keep later tasks in their phase.",
      );
    for (let j = i; j < end; j++) project.tasks[j].level--;
  });
$("#delete").onclick = () => {
  const i = project.tasks.findIndex((t) => t.id === selected);
  if (i < 0) return;
  const end = subtree(i),
    count = end - i;
  modal(
    `<h2>Delete ${count === 1 ? "this task" : count + " tasks"}?</h2><p>${esc(project.tasks[i].name)}${count > 1 ? " and its children" : ""} will be removed. Predecessor links to these tasks will also be removed. You can undo this change.</p><div class="buttons"><button data-close>Cancel</button><button id="confirmDelete" class="primary">Delete</button></div>`,
  );
  $("#confirmDelete").onclick = () => {
    close();
    mutate(() => {
      const removed = new Set(project.tasks.splice(i, count).map((t) => t.id));
      for (const t of project.tasks)
        t.deps = t.deps.filter((id) => !removed.has(id));
      selected = null;
    });
  };
};
$("#new").onclick = async () => {
  if (!(await abandon())) return;
  modal(
    `<h2>A fresh start.</h2><p>Give your project a name and its first working day.</p><label>Project name</label><input id="newName" value="Untitled project" maxlength="200"><label>Start date</label><input id="newStart" type="date" value="${iso(new Date())}"><div class="buttons"><button data-close>Cancel</button><button id="create" class="primary">Create project</button></div>`,
  );
  $("#create").onclick = () => {
    try {
      load(
        blank(
          $("#newName").value.trim() || "Untitled project",
          $("#newStart").value,
        ),
      );
      dirty = true;
      close();
      render();
    } catch (e) {
      notify(e.message);
    }
  };
};
$("#open").onclick = async () => {
  if (!(await abandon())) return;
  try {
    const files = await api("/api/projects");
    modal(
      `<h2>Open a project</h2><p>Saved locally in this project's projects folder.</p>${files.map((f) => `<button class="recent" data-file="${esc(f.filename)}">${esc(f.name)}<small style="display:block;color:#859387;margin-top:5px">${esc(f.filename)}</small></button>`).join("") || "<p>No saved projects yet.</p>"}<div class="buttons"><button data-close>Cancel</button><button id="browse">Open a project file…</button></div>`,
    );
    document.querySelectorAll("[data-file]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const r = await api("/api/open", { filename: b.dataset.file });
            load(r.project, b.dataset.file, r.revision);
            close();
          } catch (e) {
            notify(e.message);
          }
        }),
    );
    $("#browse").onclick = () => {
      $("#file").accept = ".json,.fieldplan";
      $("#file").dataset.action = "open";
      $("#file").click();
    };
  } catch (e) {
    notify(e.message);
  }
};
$("#import").onclick = async () => {
  if (!(await abandon())) return;
  modal(
    '<h2>Reuse a Microsoft Project plan</h2><p>Import an MPP file as a local template. Dates, outline, durations, milestones, and owner names are preserved. Tasks start in <b>Fixed dates</b> mode; choose Auto to use weekday scheduling.</p><p>Unsupported link types and calendar differences are listed after import. The source file is never changed.</p><div class="buttons"><button data-close>Cancel</button><button id="chooseMpp" class="primary">Choose MPP file…</button></div>',
  );
  $("#chooseMpp").onclick = () => {
    $("#file").accept = ".mpp";
    $("#file").dataset.action = "import";
    $("#file").click();
  };
};
$("#file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (e.target.dataset.action === "import") {
      notify("Reading Microsoft Project file…");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > 30 * 1024 * 1024)
        throw Error("Maximum MPP size is 30 MB.");
      let b = "";
      for (let i = 0; i < bytes.length; i += 8192)
        b += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const r = await api("/api/import", { name: file.name, content: btoa(b) });
      load(r.project);
      dirty = true;
      close();
      modal(
        `<h2>Imported ${r.project.tasks.length} activities</h2><p>Source dates are preserved. Review the plan before switching any tasks to Auto.</p><div style="max-height:260px;overflow:auto">${r.warnings.map((w) => `<p>• ${esc(w)}</p>`).join("")}</div><div class="buttons"><button data-close class="primary">Review schedule</button></div>`,
      );
    } else {
      load(JSON.parse(await file.text()));
      dirty = true;
      close();
      notify("Project opened. Save to keep a copy in this workspace.");
    }
    render();
  } catch (err) {
    notify(err.message);
  }
  e.target.value = "";
};
$("#export").onclick = () => {
  const tasks = schedule(project);
  if (!tasks.length) {
    notify("Add a task before exporting.");
    return;
  }
  const min = tasks.reduce(
      (a, t) => (a < t.start ? a : t.start),
      tasks[0].start,
    ),
    max = tasks.reduce(
      (a, t) => (a > t.finish ? a : t.finish),
      tasks[0].finish,
    );
  modal(
    `<h2>A schedule ready to share.</h2><p>Export a vector PDF with a dedicated table and Gantt layout.</p><label>From</label><input id="pdfStart" type="date" value="${min}"><label>Through</label><input id="pdfEnd" type="date" value="${plus(max, 7)}"><label>Timeline scale</label><select id="pdfScale"><option value="week">Weeks</option><option value="day">Days</option><option value="month">Months</option></select><label>Paper</label><select id="pdfPaper"><option value="tabloid">11 × 17 in (Tabloid)</option><option value="legal">8.5 × 14 in (Legal)</option><option value="a3">A3</option><option value="a4">A4</option></select><label>Row spacing</label><select id="pdfDensity"><option value="compact">Compact · more tasks per page</option><option value="comfortable">Comfortable</option></select><label>Orientation</label><select id="pdfOrientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select><label>Visible columns</label>${["duration", "start", "finish", "owner"].map((c) => `<label class="check"><input type="checkbox" data-column="${c}" ${c !== "owner" ? "checked" : ""}>${c}</label>`).join("")}<label class="check"><input id="pdfMono" type="checkbox">Grayscale</label><label class="check"><input id="pdfDates" type="checkbox" checked>Milestone dates</label><div class="buttons"><button data-close>Cancel</button><button id="makePdf" class="primary">Create PDF</button></div>`,
  );
  $("#makePdf").onclick = async () => {
    const button = $("#makePdf");
    button.disabled = true;
    try {
      const start = $("#pdfStart").value,
        end = $("#pdfEnd").value;
      date(start);
      date(end);
      if (end < start) throw Error("Export end must be after its start.");
      const result = await api("/api/export", {
        project: { ...project, tasks },
        settings: {
          start,
          end,
          scale: $("#pdfScale").value,
          paper: $("#pdfPaper").value,
          orientation: $("#pdfOrientation").value,
          density: $("#pdfDensity").value,
          columns: [...document.querySelectorAll("[data-column]:checked")].map(
            (e) => e.dataset.column,
          ),
          mono: $("#pdfMono").checked,
          milestoneDates: $("#pdfDates").checked,
        },
      });
      close();
      modal(
        `<h2>PDF saved.</h2><p>${esc(result.filename)}</p><p>Saved in the <b>exports</b> folder inside this project.</p><div class="buttons"><button data-close>Done</button><button id="viewPdf" class="primary">Open PDF</button></div>`,
      );
      $("#viewPdf").onclick = () => {
        window.open(result.url, "_blank");
      };
    } catch (e) {
      notify(e.message);
    } finally {
      button.disabled = false;
    }
  };
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    save();
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key === "z" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $("#undo").click();
  }
});
// The native shell calls this to protect unsaved edits when the window is closed.
window.fieldplanCanClose = () => !dirty;
try {
  ({ token } = await api("/api/session"));
  const recent = await api("/api/projects");
  if (recent.length) {
    const r = await api("/api/open", { filename: recent[0].filename });
    load(r.project, recent[0].filename, r.revision);
  } else render();
} catch (e) {
  render();
  notify(e.message);
}
