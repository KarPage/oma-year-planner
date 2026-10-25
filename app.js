/* Year planner UI. Plans live in localStorage. Colors come from theme.css. */
(function () {
  var STORAGE_KEY = "year-planner/v1";

  var yearLabel = document.getElementById("year-label");
  var statsEl = document.getElementById("stats");
  var clocksEl = document.getElementById("clocks");
  var board = document.getElementById("board");
  var search = document.getElementById("q");
  var statusEl = document.getElementById("status");
  var undoBtn = document.getElementById("undo");
  var actionEl = document.getElementById("action");
  var actionLabel = document.getElementById("action-label");
  var actionAdd = document.getElementById("action-add");
  var actionEdit = document.getElementById("action-edit");
  var actionOpen = document.getElementById("action-open");
  var actionDelete = document.getElementById("action-delete");
  var dialog = document.getElementById("editor");
  var form = document.getElementById("editor-form");
  var titleInput = document.getElementById("f-title");
  var colorInput = document.getElementById("f-color");
  var noteInput = document.getElementById("f-note");
  var imageInput = document.getElementById("f-image");
  var imageList = document.getElementById("f-images");
  var noteCard = document.getElementById("note-card");
  var startInput = document.getElementById("f-start");
  var endInput = document.getElementById("f-end");
  var deleteBtn = document.getElementById("f-delete");
  var formError = document.getElementById("f-error");

  var year = (function () {
    var stored = +sessionStorage.getItem("year-planner/year");
    if (stored >= 1970 && stored <= 2100) return stored;
    return new Date().getFullYear();
  })();
  var filter = "all";
  var plans = load();
  var editingId = null;
  var selection = null;
  var selectedId = null;
  var arm = null;
  var hoverDate = null;
  var gesture = null;
  var draftImages = [];
  var undoStack = [];
  var noteDismissedFor = null;
  var noteShownFor = null;

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (raw && Array.isArray(raw.plans)) {
        return raw.plans.map(Planner.normalize).filter(Boolean);
      }
    } catch (err) {
      /* fall through to the sample year */
    }
    return Planner.SAMPLE.map(function (plan) {
      return {
        id: plan.id,
        title: plan.title,
        tag: plan.tag,
        color: plan.color,
        note: plan.note || "",
        images: plan.images || [],
        start: plan.start,
        end: plan.end
      };
    });
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, plans: plans }));
    } catch (err) {
      setStatus("Couldn't store the plans in this browser. Export a backup to keep them.");
    }
  }

  function todayParts() {
    var now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function paintUndo() {
    undoBtn.hidden = undoStack.length === 0;
  }

  function remember() {
    undoStack.push({
      plans: JSON.parse(JSON.stringify(plans)),
      year: year,
      selectedId: selectedId,
      selection: selection ? { start: selection.start, end: selection.end } : null
    });
    if (undoStack.length > 30) undoStack.shift();
    paintUndo();
  }

  function undo() {
    var snap = undoStack.pop();
    paintUndo();
    if (!snap) return;
    plans = snap.plans;
    year = snap.year;
    selectedId = snap.selectedId;
    selection = snap.selection;
    arm = null;
    hoverDate = null;
    noteDismissedFor = selectedId;
    noteShownFor = null;
    noteCard.hidden = true;
    noteCard.replaceChildren();
    save();
    setStatus("Undid the last change.");
    render();
    syncTools();
  }

  function visible() {
    return Planner.filterPlans(plans, year, filter, search.value);
  }

  function planById(id) {
    for (var i = 0; i < plans.length; i++) {
      if (plans[i].id === id) return plans[i];
    }
    return null;
  }

  function ordered(a, b) {
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }

  function plansOn(iso) {
    return visible().filter(function (plan) {
      return plan.start <= iso && plan.end >= iso;
    });
  }

  function renderChrome() {
    yearLabel.textContent = String(year);
    sessionStorage.setItem("year-planner/year", String(year));
    var list = visible();
    var trips = list.filter(function (plan) { return plan.start !== plan.end; }).length;
    var figures = [
      [String(list.length), "plans"],
      [String(trips), "trips"],
      [String(Planner.daysAway(list, year)), "days away"]
    ];
    renderTodayTile();
    statsEl.replaceChildren();
    figures.forEach(function (pair) {
      var item = document.createElement("div");
      item.className = "stat-box";
      var strong = document.createElement("b");
      strong.textContent = pair[0];
      var label = document.createElement("span");
      label.textContent = pair[1];
      item.append(strong, label);
      statsEl.append(item);
    });
    renderClocks();
  }

  function renderTodayTile() {
    var now = new Date();
    var kicker = document.getElementById("today-kicker");
    var line = document.getElementById("today-line");
    if (!kicker || !line) return;
    var weekday = now.toLocaleDateString(undefined, { weekday: "long" });
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    kicker.textContent = "Today · " + weekday;
    line.textContent = now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear();
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function splitDuration(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      mins: Math.floor((total % 3600) / 60),
      secs: total % 60
    };
  }

  function dayStamp(iso, end) {
    var parts = Planner.parse(iso);
    if (!parts) return null;
    if (end) return new Date(parts.y, parts.m - 1, parts.d, 23, 59, 59, 999).getTime();
    return new Date(parts.y, parts.m - 1, parts.d, 0, 0, 0, 0).getTime();
  }

  function focusPlan(plan) {
    var start = Planner.parse(plan.start);
    if (start && start.y !== year) year = start.y;
    selectedId = plan.id;
    selection = { start: plan.start, end: plan.end };
    arm = null;
    hoverDate = null;
    noteDismissedFor = plan.id;
    noteShownFor = null;
    noteCard.hidden = true;
    noteCard.replaceChildren();
    setStatus(plan.title + " · " + rangeLabel(plan));
    render();
    syncTools();
  }

  function nextClock(plan, ms, reverse) {
    var piece = splitDuration(ms);
    var block = document.createElement("button");
    block.type = "button";
    block.className = "next-clock" + (reverse ? " since-clock" : "");
    block.title = "Show " + plan.title + " on the calendar";
    var kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = reverse ? "Since last plan" : "Next plan";
    var who = document.createElement("div");
    who.className = "who";
    who.textContent = plan.title;
    var face = document.createElement("div");
    face.className = "face";
    function unit(value, label, days) {
      var cell = document.createElement("div");
      cell.className = "unit" + (days ? " days" : "");
      var num = document.createElement("b");
      num.textContent = days ? String(value) : pad2(value);
      var caption = document.createElement("span");
      caption.textContent = label;
      cell.append(num, caption);
      return cell;
    }
    function sep() {
      var mark = document.createElement("div");
      mark.className = "sep";
      mark.textContent = ":";
      return mark;
    }
    var days = unit(piece.days, piece.days === 1 ? "Day" : "Days", true);
    var hours = unit(piece.hours, "Hrs");
    var mins = unit(piece.mins, "Min");
    var secs = unit(piece.secs, "Sec");
    face.append(days, hours, sep(), mins, sep(), secs);
    block.append(kicker, who, face);
    block.addEventListener("click", function () { focusPlan(plan); });
    return block;
  }

  function clockPlan(kind, plan, ms) {
    var piece = splitDuration(ms);
    var block = document.createElement("div");
    block.className = "clock " + kind;
    var kicker = document.createElement("div");
    kicker.className = "kicker";
    kicker.textContent = kind === "since" ? "Since last plan" : "Next plan";
    var readout = document.createElement("div");
    readout.className = "readout";
    var days = document.createElement("div");
    days.className = "days";
    days.append(document.createTextNode(String(piece.days)));
    var unit = document.createElement("small");
    unit.textContent = piece.days === 1 ? "day" : "days";
    days.append(unit);
    var hms = document.createElement("div");
    hms.className = "hms";
    hms.textContent = pad2(piece.hours) + ":" + pad2(piece.mins) + ":" + pad2(piece.secs);
    readout.append(days, hms);
    var who = document.createElement("div");
    who.className = "who";
    who.textContent = plan.title;
    block.append(kicker, readout, who);
    return block;
  }

  function renderClocks() {
    var now = new Date();
    var today = cellDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    var past = null;
    var future = null;
    plans.forEach(function (plan) {
      if (plan.end < today && (!past || plan.end > past.end)) past = plan;
      if (plan.start > today && (!future || plan.start < future.start)) future = plan;
    });
    clocksEl.replaceChildren();
    var nowMs = now.getTime();
    if (past) clocksEl.append(nextClock(past, nowMs - dayStamp(past.end, true), true));
    if (future) clocksEl.append(nextClock(future, dayStamp(future.start, false) - nowMs, false));
    if (!past && !future) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Add a plan before or after today.";
      clocksEl.append(empty);
    }
  }

  function cellDate(y, m, d) {
    return y + "-" + Planner.pad(m) + "-" + Planner.pad(d);
  }

  function dateFromPoint(x, y) {
    var cells = board.querySelectorAll(".cell[data-date]");
    for (var i = 0; i < cells.length; i++) {
      var rect = cells[i].getBoundingClientRect();
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) {
        return cells[i].dataset.date;
      }
    }
    return null;
  }

  function renderBoard() {
    var list = visible();
    var laid = Planner.layout(list, year);
    var today = todayParts();
    var showToday = today.y === year;
    var yearGrid = document.createElement("div");
    yearGrid.className = "calendar";
    yearGrid.setAttribute("role", "grid");
    yearGrid.setAttribute("aria-label", "Year " + year);

    var corner = document.createElement("div");
    corner.className = "corner";
    corner.textContent = "Month";
    yearGrid.append(corner);

    for (var day = 1; day <= 31; day++) {
      var head = document.createElement("div");
      head.className = "daynum";
      head.dataset.day = String(day);
      if (showToday && day === today.d) head.classList.add("today");
      head.textContent = Planner.pad(day);
      head.style.gridColumn = String(day + 1);
      head.style.gridRow = "1";
      yearGrid.append(head);
    }

    var weekdays = [];
    for (var month = 1; month <= 12; month++) {
      var lanes = laid.lanes[month - 1] || 1;
      if (lanes < 1) lanes = 1;
      var label = document.createElement("div");
      label.className = "month";
      if (showToday && month === today.m) label.classList.add("now");
      var num = document.createElement("span");
      num.className = "num";
      num.textContent = Planner.pad(month);
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = Planner.MONTHS[month - 1];
      label.append(num, name);
      label.style.gridColumn = "1";
      label.style.gridRow = String(month + 1);
      label.style.setProperty("--lanes", String(lanes));
      yearGrid.append(label);

      var dim = Planner.daysInMonth(year, month);
      for (var d = 1; d <= 31; d++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridColumn = String(d + 1);
        cell.style.gridRow = String(month + 1);
        cell.style.setProperty("--lanes", String(lanes));
        if (d > dim) {
          cell.classList.add("void");
        } else {
          var iso = cellDate(year, month, d);
          cell.dataset.date = iso;
          var letter = document.createElement("span");
          letter.className = "wd";
          letter.textContent = Planner.weekdayLetter(year, month, d);
          letter.style.gridColumn = String(d + 1);
          letter.style.gridRow = String(month + 1);
          var dow = Planner.weekday(year, month, d);
          if (dow === 0) {
            cell.classList.add("weekend");
            letter.classList.add("sun");
          }
          if (showToday && month === today.m && d === today.d) {
            cell.classList.add("today");
            letter.classList.add("today");
          }
          weekdays.push(letter);
          cell.addEventListener("click", onCellClick);
        }
        yearGrid.append(cell);
      }
    }

    var tooled = {};
    laid.bars.forEach(function (bar) {
      var plan = bar.plan;
      var el = document.createElement("button");
      el.type = "button";
      el.className = "bar";
      el.style.setProperty("--cat", plan.color || "#74a869");
      if (plan.id === selectedId) el.classList.add("selected");
      el.title = plan.title + " · " + rangeLabel(plan) + (plan.note ? " · " + plan.note.slice(0, 80) : "");
      el.style.gridColumn = (bar.startDay + 1) + " / " + (bar.endDay + 2);
      el.style.gridRow = String(bar.month + 1);
      el.style.setProperty("--lane", String(bar.lane));
      el.style.setProperty("--lanes", String(laid.lanes[bar.month - 1] || 1));
      el.dataset.id = plan.id;

      var fill = document.createElement("span");
      fill.className = "fill";
      var text = document.createElement("span");
      text.className = "label";
      text.textContent = plan.title;
      fill.append(text);

      var spanDays = bar.endDay - bar.startDay;
      if (spanDays < 1) fill.classList.add("single");
      var planStart = Planner.parse(plan.start);
      var planEnd = Planner.parse(plan.end);
      var atStart = planStart && planStart.y === year && planStart.m === bar.month && planStart.d === bar.startDay;
      var atEnd = planEnd && planEnd.y === year && planEnd.m === bar.month && planEnd.d === bar.endDay;
      if (atStart) fill.append(handle("w"));
      if (atEnd) fill.append(handle("e"));
      if (!tooled[plan.id]) {
        tooled[plan.id] = true;
        fill.append(planTools(plan));
      }

      fill.addEventListener("pointerdown", onBarDown);
      fill.addEventListener("dblclick", function (event) {
        event.stopPropagation();
        event.preventDefault();
        selectedId = plan.id;
        selection = { start: plan.start, end: plan.end };
        openEditor(plan, null, true);
      });
      el.append(fill);
      yearGrid.append(el);
    });

    weekdays.forEach(function (letter) { yearGrid.append(letter); });

    board.replaceChildren(yearGrid);
    paintSelection();
  }

  function toolButton(kind, label, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = kind === "delete" ? "danger" : "";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = kind === "edit"
      ? '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11.8V13.5h1.7l7.4-7.4-1.7-1.7-7.4 7.4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9.2 4.8l1.7 1.7" stroke="currentColor" stroke-width="1.4"/></svg>'
      : kind === "view"
        ? '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.6 4.5l.5 8h5.8l.5-8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
    button.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      event.preventDefault();
      onClick();
    });
    return button;
  }

  function planTools(plan) {
    var box = document.createElement("div");
    box.className = "plan-tools";
    box.append(toolButton("edit", "Edit plan", function () { openEditor(plan); }));
    box.append(toolButton("view", "View plan", function () {
      if (noteShownFor === plan.id && !noteCard.hidden) {
        closeNote();
        return;
      }
      noteDismissedFor = null;
      showNote(plan, true);
      syncTools();
    }));
    box.append(toolButton("delete", "Delete plan", function () { deletePlan(plan.id); }));
    return box;
  }

  function syncTools() {
    board.classList.toggle("show-tools", !!(selectedId && noteDismissedFor === selectedId));
  }

  function handle(side) {
    var node = document.createElement("span");
    node.className = "handle " + side;
    node.dataset.resize = side === "w" ? "start" : "end";
    return node;
  }

  function rangeLabel(plan) {
    if (plan.start === plan.end) return pretty(plan.start);
    return pretty(plan.start) + " – " + pretty(plan.end);
  }

  function pretty(iso) {
    var p = Planner.parse(iso);
    if (!p) return iso;
    return Planner.MONTHS[p.m - 1] + " " + p.d;
  }

  function dayNumbersIn(start, end) {
    var marks = {};
    if (!start || !end) return marks;
    var span = ordered(start, end);
    var cursor = span.start;
    var guard = 0;
    while (cursor && cursor <= span.end && guard < 800) {
      var parts = Planner.parse(cursor);
      if (parts && parts.y === year) marks[parts.d] = true;
      var next = Planner.addDays(cursor, 1);
      if (!next || next === cursor) break;
      cursor = next;
      guard += 1;
    }
    return marks;
  }

  function paintDaynums(marks) {
    board.querySelectorAll(".daynum").forEach(function (head) {
      head.classList.toggle("picked", !!marks[Number(head.dataset.day)]);
    });
  }

  function paintSelection() {
    var follow = arm ? ordered(arm, hoverDate || arm) : null;
    var committed = !arm && selection ? selection : null;
    var single = committed && committed.start === committed.end;
    board.querySelectorAll(".cell[data-date]").forEach(function (cell) {
      var iso = cell.dataset.date;
      cell.classList.toggle("follow", !!(follow && iso >= follow.start && iso <= follow.end));
      cell.classList.toggle("picked", !!(single && iso === committed.start));
      cell.classList.toggle("range", !!(committed && !single && iso >= committed.start && iso <= committed.end));
    });
    var active = follow || committed;
    paintDaynums(active ? dayNumbersIn(active.start, active.end) : {});
    updateAction();
  }

  function paintDrop(start, end) {
    var range = ordered(start, end);
    board.querySelectorAll(".cell[data-date]").forEach(function (cell) {
      var iso = cell.dataset.date;
      cell.classList.toggle("drop", iso >= range.start && iso <= range.end);
    });
    paintDaynums(dayNumbersIn(range.start, range.end));
  }

  function clearDrop() {
    board.querySelectorAll(".cell.drop").forEach(function (cell) {
      cell.classList.remove("drop");
    });
  }

  function updateAction() {
    var plan = selectedId ? planById(selectedId) : null;
    if (!plan && !selection) {
      actionEl.hidden = true;
      noteCard.hidden = true;
      noteCard.replaceChildren();
      return;
    }
    actionEl.hidden = false;
    actionEdit.hidden = !plan;
    actionDelete.hidden = !plan;
    if (plan) {
      actionEl.hidden = true;
      if (noteShownFor === plan.id && !noteCard.hidden) showNote(plan, true);
      else if (noteShownFor !== plan.id && noteDismissedFor !== plan.id) {
        noteCard.hidden = true;
        noteCard.replaceChildren();
      }
      syncTools();
    } else {
      var days = Planner.diffDays(selection.start, selection.end) + 1;
      var here = selection.start === selection.end ? plansOn(selection.start).length : 0;
      var when = selection.start === selection.end
        ? pretty(selection.start)
        : pretty(selection.start) + " – " + pretty(selection.end) + " · " + days + " days";
      if (here) when += " · " + here + (here === 1 ? " plan" : " plans");
      actionLabel.textContent = when;
      actionAdd.hidden = false;
      actionAdd.textContent = here ? "Add another" : "Add plan";
      actionEdit.hidden = true;
      actionOpen.hidden = true;
      actionDelete.hidden = true;
      noteShownFor = null;
      noteCard.hidden = true;
      noteCard.replaceChildren();
    }
  }

  function linkify(text, parent) {
    var rest = String(text || "");
    var pattern = /https?:\/\/[^\s]+/g;
    var match;
    var last = 0;
    while ((match = pattern.exec(rest))) {
      parent.append(document.createTextNode(rest.slice(last, match.index)));
      var href = match[0].replace(/[),.;]+$/, "");
      var link = document.createElement("a");
      link.href = href;
      link.textContent = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
      last = match.index + href.length;
      if (href.length < match[0].length) {
        parent.append(document.createTextNode(match[0].slice(href.length)));
        last = match.index + match[0].length;
      }
    }
    parent.append(document.createTextNode(rest.slice(last)));
  }

  function showNote(plan, force) {
    var images = plan.images || [];
    if (!force && (noteDismissedFor === plan.id || (!plan.note && !images.length))) {
      noteCard.hidden = true;
      noteCard.replaceChildren();
      return;
    }
    noteCard.hidden = false;
    noteCard.replaceChildren();
    noteShownFor = plan.id;
    var sheet = document.createElement("div");
    sheet.className = "note-sheet";
    if (plan.note) {
      var body = document.createElement("p");
      linkify(plan.note, body);
      sheet.append(body);
    } else if (!images.length) {
      var empty = document.createElement("p");
      empty.textContent = "No note yet.";
      sheet.append(empty);
    }
    if (images.length) {
      var shots = document.createElement("div");
      shots.className = "shots";
      images.forEach(function (image) {
        var frame = document.createElement("div");
        frame.className = "shot";
        var img = document.createElement("img");
        img.src = image.src;
        img.alt = image.name || "Attached image";
        frame.append(img);
        shots.append(frame);
      });
      sheet.append(shots);
    }
    noteCard.append(sheet);
    noteCard.style.borderTopColor = plan.color || "var(--accent)";
    noteCard.style.borderTopWidth = "2px";
    placeNote();
    noteCard.querySelectorAll("img").forEach(function (img) {
      img.addEventListener("load", placeNote);
    });
  }

  function placeNote() {
    var bar = board.querySelector(".bar.selected");
    var stage = board.parentElement;
    if (!bar || !stage || noteCard.hidden) return;
    var br = bar.getBoundingClientRect();
    var sr = stage.getBoundingClientRect();
    var width = noteCard.offsetWidth || 380;
    var height = noteCard.offsetHeight || 160;
    var left = br.left + (br.width / 2) - (width / 2) - sr.left;
    left = Math.max(8, Math.min(left, sr.width - width - 8));
    var top = br.bottom - sr.top + 10;
    var above = false;
    if (top + height > sr.height - 8) {
      top = Math.max(8, br.top - sr.top - height - 10);
      above = true;
    }
    noteCard.style.left = left + "px";
    noteCard.style.top = top + "px";
    noteCard.classList.toggle("above", above);
    var arrow = br.left + (br.width / 2) - sr.left - left - 5;
    noteCard.style.setProperty("--arrow", Math.max(12, Math.min(arrow, width - 22)) + "px");
  }

  function closeNote() {
    noteDismissedFor = selectedId;
    noteShownFor = null;
    noteCard.hidden = true;
    syncTools();
  }

  document.addEventListener("pointerdown", function (event) {
    if (noteCard.hidden) return;
    if (noteCard.contains(event.target)) return;
    if (event.target.closest && event.target.closest(".bar.selected")) return;
    closeNote();
  });

  function render() {
    if (selectedId && !planById(selectedId)) selectedId = null;
    renderChrome();
    renderBoard();
  }

  function listenPointer() {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function silencePointer() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function onBarDown(event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    var bar = event.currentTarget.closest(".bar");
    var plan = planById(bar.dataset.id);
    if (!plan) return;
    var resize = event.target.dataset && event.target.dataset.resize;
    gesture = {
      kind: "plan",
      mode: resize || "move",
      id: plan.id,
      originStart: plan.start,
      originEnd: plan.end,
      grabDate: dateFromPoint(event.clientX, event.clientY) || plan.start,
      moved: false,
      x: event.clientX,
      y: event.clientY
    };
    listenPointer();
  }

  function onArmMove(event) {
    if (!arm || gesture || dialog.open) return;
    var iso = dateFromPoint(event.clientX, event.clientY);
    if (!iso || iso === hoverDate) return;
    hoverDate = iso;
    paintSelection();
  }

  function onPointerMove(event) {
    if (!gesture) return;
    var iso = dateFromPoint(event.clientX, event.clientY);
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
    gesture.moved = true;
    if (!iso) return;
    var plan = planById(gesture.id);
    if (!plan) return;
    var preview = previewDates(gesture, iso);
    if (!preview) return;
    paintDrop(preview.start, preview.end);
    board.querySelectorAll('.bar[data-id="' + plan.id + '"]').forEach(function (bar) {
      bar.classList.add("lifting");
    });
    setStatus(gesture.mode === "move"
      ? "Move " + plan.title + " to " + rangeText(preview)
      : "Resize " + plan.title + " to " + rangeText(preview));
  }

  function previewDates(g, iso) {
    if (g.mode === "start") return ordered(iso, g.originEnd);
    if (g.mode === "end") return ordered(g.originStart, iso);
    var delta = Planner.diffDays(g.grabDate, iso);
    return {
      start: Planner.addDays(g.originStart, delta),
      end: Planner.addDays(g.originEnd, delta)
    };
  }

  function rangeText(range) {
    return range.start === range.end ? pretty(range.start) : pretty(range.start) + " – " + pretty(range.end);
  }

  function onPointerUp(event) {
    silencePointer();
    if (!gesture) return;
    var current = gesture;
    gesture = null;
    clearDrop();
    if (!current.moved) {
      if (arm && current.grabDate) {
        commitRange(current.grabDate);
        return;
      }
      arm = null;
      hoverDate = null;
      var plan = planById(current.id);
      if (plan && selectedId === plan.id && noteShownFor === plan.id && !noteCard.hidden) {
        closeNote();
        return;
      }
      noteDismissedFor = null;
      selectedId = current.id;
      if (plan) selection = { start: plan.start, end: plan.end };
      setStatus("Drag either end to change the days. Double-click to edit the note.");
      paintSelection();
      if (plan) {
        showNote(plan, true);
        syncTools();
      }
      board.querySelectorAll(".bar").forEach(function (bar) {
        bar.classList.toggle("selected", bar.dataset.id === selectedId);
      });
      return;
    }
    var iso = dateFromPoint(event.clientX, event.clientY);
    if (!iso) {
      setStatus("Drop on a day to move the plan.");
      render();
      return;
    }
    var next = previewDates(current, iso);
    applyDates(current.id, next.start, next.end);
  }

  function applyDates(id, start, end) {
    var plan = planById(id);
    if (!plan) return;
    var normalized = Planner.normalize({
      id: plan.id,
      title: plan.title,
      tag: plan.tag,
      color: plan.color,
      note: plan.note,
      images: plan.images,
      start: start,
      end: end
    });
    if (!normalized) {
      setStatus("That date is not a real day.");
      render();
      return;
    }
    if (normalized.start === plan.start && normalized.end === plan.end) {
      setStatus(plan.title + " stays on " + rangeLabel(plan) + ".");
      render();
      return;
    }
    remember();
    plans = plans.map(function (item) { return item.id === id ? normalized : item; });
    var startYear = Planner.parse(normalized.start).y;
    if (startYear !== year) year = startYear;
    selectedId = normalized.id;
    selection = { start: normalized.start, end: normalized.end };
    save();
    setStatus("Moved " + normalized.title + " to " + rangeLabel(normalized) + ".");
    render();
  }

  function clearPlanSelection() {
    selectedId = null;
    board.querySelectorAll(".bar.selected").forEach(function (bar) {
      bar.classList.remove("selected");
    });
  }

  function commitRange(iso) {
    var range = ordered(arm, iso);
    selection = range;
    arm = null;
    hoverDate = null;
    clearPlanSelection();
    paintSelection();
    openEditor(null, { start: range.start, end: range.end });
  }

  function onCellClick(event) {
    var iso = event.currentTarget.dataset.date;
    clearPlanSelection();
    if (arm) {
      commitRange(iso);
      return;
    }
    if (selection && selection.start === iso && selection.end === iso) {
      arm = iso;
      hoverDate = iso;
      paintSelection();
      setStatus("Click a day to add the plan, or click this day again to add just this day.");
      return;
    }
    selection = { start: iso, end: iso };
    paintSelection();
  }

  function renderDraftImages() {
    imageList.replaceChildren();
    draftImages.forEach(function (image, index) {
      var frame = document.createElement("div");
      frame.className = "shot";
      var img = document.createElement("img");
      img.src = image.src;
      img.alt = image.name || "Attached image";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", "Remove image");
      remove.addEventListener("click", function () {
        draftImages.splice(index, 1);
        renderDraftImages();
      });
      frame.append(img, remove);
      imageList.append(frame);
    });
  }

  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 960;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        var quality = 0.72;
        var data = canvas.toDataURL("image/jpeg", quality);
        if (data.length > 500000) data = canvas.toDataURL("image/jpeg", 0.5);
        resolve(data);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image"));
      };
      img.src = url;
    });
  }

  function openEditor(plan, defaults, focusNote) {
    editingId = plan ? plan.id : null;
    formError.textContent = "";
    titleInput.value = plan ? plan.title : "";
    colorInput.value = plan && plan.color ? plan.color : "#74a869";
    var start = plan ? plan.start : (defaults && defaults.start) || cellDate(year, todayParts().m, todayParts().d);
    var end = plan ? plan.end : (defaults && defaults.end) || start;
    if (!plan && defaults && defaults.single) end = start;
    if (end < start) end = start;
    startInput.value = start;
    endInput.value = end;
    noteInput.value = plan && plan.note ? plan.note : "";
    draftImages = plan && plan.images ? plan.images.map(function (image) {
      return { name: image.name, src: image.src };
    }) : [];
    renderDraftImages();
    deleteBtn.hidden = !plan;
    document.getElementById("editor-title").textContent = plan ? "Edit plan" : "Add plan";
    dialog.showModal();
    if (focusNote && plan) {
      noteInput.focus();
    } else {
      titleInput.focus();
      titleInput.select();
    }
  }

  function closeEditor() {
    if (dialog.open) dialog.close();
  }

  function activeRange() {
    if (arm) return ordered(arm, hoverDate || arm);
    return selection;
  }

  function addFromSelection(singleDay) {
    var today = todayParts();
    var range = activeRange();
    var start = range ? range.start : (today.y === year ? cellDate(year, today.m, today.d) : cellDate(year, 1, 1));
    var end = range && !singleDay ? range.end : start;
    openEditor(null, { start: start, end: end, single: singleDay });
  }

  document.getElementById("f-attach").addEventListener("click", function () {
    imageInput.click();
  });

  imageInput.addEventListener("change", function () {
    var file = imageInput.files && imageInput.files[0];
    imageInput.value = "";
    if (!file) return;
    if (draftImages.length >= 4) {
      formError.textContent = "A plan can keep four images.";
      return;
    }
    if (!/^image\//.test(file.type)) {
      formError.textContent = "Choose an image file.";
      return;
    }
    shrinkImage(file).then(function (src) {
      if (src.length > 700000) {
        formError.textContent = "That image is too large to keep with the plan.";
        return;
      }
      draftImages.push({ name: file.name || "image", src: src });
      formError.textContent = "";
      renderDraftImages();
    }).catch(function () {
      formError.textContent = "Couldn't read that image.";
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var normalized = Planner.normalize({
      id: editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title: titleInput.value,
      color: colorInput.value,
      note: noteInput.value,
      images: draftImages,
      start: startInput.value,
      end: endInput.value
    });
    if (!normalized) {
      formError.textContent = "Give the plan a name and a real start and end date.";
      return;
    }
    remember();
    if (editingId) {
      plans = plans.map(function (plan) {
        return plan.id === editingId ? normalized : plan;
      });
    } else {
      plans = plans.concat([normalized]);
    }
    var startYear = Planner.parse(normalized.start).y;
    if (startYear !== year) year = startYear;
    selectedId = normalized.id;
    selection = { start: normalized.start, end: normalized.end };
    arm = null;
    hoverDate = null;
    noteDismissedFor = null;
    save();
    closeEditor();
    setStatus((editingId ? "Updated " : "Added ") + normalized.title + ".");
    render();
  });

  function deletePlan(id) {
    var plan = planById(id);
    if (!plan) return;
    remember();
    plans = plans.filter(function (item) { return item.id !== id; });
    if (selectedId === id) selectedId = null;
    save();
    setStatus("Deleted " + plan.title + ".");
    render();
  }

  deleteBtn.addEventListener("click", function () {
    if (!editingId) return;
    var id = editingId;
    closeEditor();
    deletePlan(id);
  });

  document.getElementById("f-cancel").addEventListener("click", closeEditor);

  startInput.addEventListener("change", function () {
    if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
  });

  actionAdd.addEventListener("click", function () {
    addFromSelection(!!selectedId);
  });
  actionEdit.addEventListener("click", function () {
    var plan = planById(selectedId);
    if (plan) openEditor(plan);
  });
  actionOpen.addEventListener("click", function () {
    var plan = planById(selectedId);
    if (!plan) return;
    if (noteShownFor === plan.id && !noteCard.hidden) {
      closeNote();
      return;
    }
    noteDismissedFor = null;
    showNote(plan, true);
  });
  actionDelete.addEventListener("click", function () {
    if (selectedId) deletePlan(selectedId);
  });

  document.getElementById("prev").addEventListener("click", function () {
    year -= 1;
    arm = null;
    hoverDate = null;
    render();
  });
  document.getElementById("next").addEventListener("click", function () {
    year += 1;
    arm = null;
    hoverDate = null;
    render();
  });
  document.getElementById("today-title").addEventListener("click", function () {
    document.getElementById("today").click();
  });

  document.getElementById("today").addEventListener("click", function () {
    year = todayParts().y;
    var today = todayParts();
    selection = { start: cellDate(year, today.m, today.d), end: cellDate(year, today.m, today.d) };
    arm = null;
    hoverDate = null;
    selectedId = null;
    render();
    var cell = board.querySelector(".cell.today");
    if (cell) cell.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  document.getElementById("add").addEventListener("click", function () {
    addFromSelection(false);
  });

  search.addEventListener("input", function () {
    render();
    search.focus();
  });

  undoBtn.addEventListener("click", undo);

  document.addEventListener("keydown", function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !dialog.open) {
      var tagName = event.target && event.target.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA") return;
      event.preventDefault();
      undo();
    }
  });

  document.getElementById("export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ version: 1, plans: plans }, null, 2) + "\n"], {
      type: "application/json"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "year-planner.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Exported " + plans.length + " plans.");
  });

  document.getElementById("import").addEventListener("click", function () {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    file.text().then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        setStatus("That file is not JSON.");
        return;
      }
      var list = Array.isArray(data) ? data : data && data.plans;
      if (!Array.isArray(list)) {
        setStatus("The backup needs a plans list.");
        return;
      }
      var next = [];
      list.forEach(function (item) {
        var plan = Planner.normalize(item);
        if (!plan) return;
        if (!plan.id) plan.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + next.length;
        next.push(plan);
      });
      if (!next.length) {
        setStatus("No plans found in that backup.");
        return;
      }
      remember();
      plans = next;
      selectedId = null;
      selection = null;
      save();
      setStatus("Imported " + next.length + " plans.");
      render();
    });
  });

  document.addEventListener("keydown", function (event) {
    var tag = event.target && event.target.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || (event.target && event.target.isContentEditable);
    if (event.key === "Escape" && gesture) {
      gesture = null;
      silencePointer();
      clearDrop();
      setStatus("");
      render();
      return;
    }
    if (event.key === "Escape" && !dialog.open) {
      selection = null;
      arm = null;
      hoverDate = null;
      selectedId = null;
      paintSelection();
      board.querySelectorAll(".bar.selected").forEach(function (bar) { bar.classList.remove("selected"); });
      return;
    }
    if (typing || dialog.open) return;
    if (event.key === "t" || event.key === "T") {
      document.getElementById("today").click();
    } else if (event.key === "[") {
      year -= 1;
      render();
    } else if (event.key === "]") {
      year += 1;
      render();
    } else if (event.key === "n" || event.key === "a") {
      addFromSelection(false);
    } else if (event.key === "Enter") {
      var chosen = selectedId ? planById(selectedId) : null;
      if (chosen) openEditor(chosen);
      else if (selection) addFromSelection(false);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      deletePlan(selectedId);
    } else if (event.key === "/") {
      event.preventDefault();
      search.focus();
    }
  });

  window.addEventListener("pointermove", onArmMove);
  setInterval(renderClocks, 1000);

  render();
})();
