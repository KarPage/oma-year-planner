/* Popovers, notes, and shared placement. */
function placeElement(el, anchor) {
  var rect = el.getBoundingClientRect();
  var placed = Planner.placeNear(
    anchor,
    {
      width: rect.width || anchor.fallbackWidth || 200,
      height: rect.height || anchor.fallbackHeight || 40
    },
    { width: window.innerWidth, height: window.innerHeight },
    anchor.gap,
    8
  );
  el.style.left = placed.left + "px";
  el.style.top = placed.top + "px";
  return placed;
}

function showFloater(text) {
  if (!rangeFloater || !text) return;
  rangeFloater.hidden = false;
  rangeFloater.textContent = text;
  var x = pointerXY ? pointerXY.x : 24;
  var y = pointerXY ? pointerXY.y : 24;
  placeElement(rangeFloater, {
    left: x + 14,
    top: y + 15,
    bottom: y + 16,
    gap: 0,
    fallbackWidth: 180,
    fallbackHeight: 28
  });
}

function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

function showTip(iso, x, y) {
  if (!tipEl) return;
  var list = plansOn(iso).filter(Planner.isSingleDay);
  if (!list.length) return;
  tipEl.hidden = false;
  tipEl.replaceChildren();
  list.forEach(function (plan) {
    var line = document.createElement("div");
    line.textContent = plan.title;
    tipEl.append(line);
  });
  placeElement(tipEl, {
    left: x + 12,
    top: y + 13,
    bottom: y + 14,
    gap: 0,
    fallbackWidth: 160,
    fallbackHeight: 24
  });
}

function closeDayList() {
  if (dayList) dayList.hidden = true;
}

function openDayList(iso, anchor) {
  if (!dayList) return;
  var all = plansOn(iso).filter(Planner.isSingleDay);
  var list = all.length > 3 ? all.slice(3) : all;
  if (!list.length) return;
  hideTip();
  dayList.hidden = false;
  dayList.replaceChildren();
  list.forEach(function (plan) {
    var row = document.createElement("div");
    row.className = "day-list-row";
    var pick = document.createElement("button");
    pick.type = "button";
    pick.className = "day-list-pick";
    var swatch = document.createElement("span");
    swatch.className = "dot";
    swatch.style.background = plan.color || "var(--accent)";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = plan.title;
    pick.append(swatch, name);
    pick.addEventListener("click", function () {
      var back = anchor;
      closeDayList();
      openQuickEdit(plan.id, back);
    });
    row.append(pick);
    dayList.append(row);
  });
  var rect = anchor.getBoundingClientRect();
  placeElement(dayList, {
    left: rect.left,
    top: rect.top,
    bottom: rect.bottom,
    fallbackWidth: dayList.offsetWidth || 180,
    fallbackHeight: dayList.offsetHeight || 40
  });
}

function closeQuickEdit(restore) {
  if (!quickEdit || quickEdit.hidden) return;
  quickEdit.hidden = true;
  var back = quickReturn;
  quickReturn = null;
  quickId = null;
  if (restore && back && back.focus) back.focus();
}

function paintQuickTypes(plan) {
  var row = document.getElementById("qe-types");
  if (!row) return;
  var current = Planner.planType(plan);
  row.replaceChildren();
  ["Trip", "Event", "Reminder"].forEach(function (type) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = type;
    button.setAttribute("aria-pressed", type === current ? "true" : "false");
    button.addEventListener("click", function () {
      saveQuick({ type: type });
    });
    row.append(button);
  });
}

function themeSwatch(name) {
  var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : "";
}

var PLAN_SWATCHES = [
  { name: "--teal", label: "Teal" },
  { name: "--sky", label: "Sky" },
  { name: "--lavender", label: "Lavender" },
  { name: "--sand", label: "Sand" },
  { name: "--rose", label: "Rose" },
  { name: "--mint", label: "Mint" }
];

function paintQuickSwatches(plan) {
  var row = document.getElementById("qe-swatches");
  if (!row) return;
  row.replaceChildren();
  PLAN_SWATCHES.forEach(function (swatch) {
    var hex = themeSwatch(swatch.name);
    if (!hex) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "qe-swatch";
    button.style.background = "var(" + swatch.name + ")";
    button.setAttribute("aria-label", swatch.label);
    button.setAttribute("aria-pressed", plan.color === hex ? "true" : "false");
    button.addEventListener("click", function () {
      saveQuick({ color: hex });
    });
    row.append(button);
  });
}

function closeAwayPop(restore) {
  if (!awayPop || awayPop.hidden) return;
  awayPop.hidden = true;
  awayPop.replaceChildren();
  var back = awayReturn;
  awayReturn = null;
  if (restore && back) focusNoScroll(back);
}

function placeAwayPop(anchor) {
  var box = anchor.getBoundingClientRect();
  var placed = placeElement(awayPop, {
    left: box.left,
    top: box.top,
    bottom: box.bottom,
    fallbackWidth: 280,
    fallbackHeight: 80
  });
  awayPop.classList.toggle("above", placed.flipped);
  var width = awayPop.getBoundingClientRect().width || 280;
  var arrow = box.left + (box.width / 2) - placed.left - 4;
  awayPop.style.setProperty("--arrow", Math.max(12, Math.min(arrow, width - 20)) + "px");
  awayPop.style.setProperty("--origin-y", placed.flipped ? "100%" : "0");
}

function focusNoScroll(el) {
  if (el && el.focus) el.focus({ preventScroll: true });
}

function openAwayExplainer(anchor) {
  if (!awayPop) return;
  closeQuickEdit(false);
  closeDayList();
  hideTip();
  awayReturn = anchor;
  awayPop.hidden = false;
  awayPop.replaceChildren();
  var text = document.createElement("p");
  text.textContent = "Days away: total trip days in each month. Click a number for details.";
  awayPop.append(text);
  placeAwayPop(anchor);
  focusNoScroll(awayPop);
}

function openAwayMonth(ym, anchor) {
  if (!awayPop) return;
  var parts = String(ym || "").split("-");
  var detail = Planner.monthAwayDetail(visible(), +parts[0], +parts[1]);
  closeQuickEdit(false);
  closeDayList();
  hideTip();
  awayReturn = anchor;
  awayPop.hidden = false;
  awayPop.replaceChildren();
  var title = document.createElement("p");
  title.className = "away-title";
  title.textContent = detail.label + " · " + Planner.plural(detail.days, "day") + " away";
  awayPop.append(title);
  if (!detail.plans.length) {
    var empty = document.createElement("p");
    empty.className = "away-empty";
    empty.textContent = "No trips this month.";
    awayPop.append(empty);
  } else {
    var list = document.createElement("ul");
    detail.plans.forEach(function (item) {
      var li = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "away-plan";
      var dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = item.color || "var(--accent)";
      var name = document.createElement("span");
      name.className = "name";
      var when = item.start === item.end
        ? Planner.prettyDate(item.start)
        : Planner.prettyDate(item.start) + " – " + Planner.prettyDate(item.end);
      name.textContent = item.title + ": " + when + " (" + Planner.plural(item.days, "day") + ")";
      button.append(dot, name);
      button.addEventListener("click", function () {
        var back = awayReturn;
        closeAwayPop(false);
        openQuickEdit(item.id, back);
      });
      li.append(button);
      list.append(li);
    });
    awayPop.append(list);
  }
  placeAwayPop(anchor);
  var first = awayPop.querySelector("button");
  focusNoScroll(first || awayPop);
}

function openQuickEdit(id, returnEl) {
  var plan = planById(id);
  if (!plan || !quickEdit) return;
  closeAwayPop(false);
  closeDayList();
  hideTip();
  quickId = id;
  quickReturn = returnEl || null;
  quickEdit.hidden = false;
  var locked = plan.source === "gcal";
  quickEdit.classList.toggle("is-gcal", locked);
  qeName.readOnly = locked;
  qeName.value = plan.title;
  document.getElementById("qe-types").hidden = locked;
  document.getElementById("qe-swatches").hidden = locked;
  document.getElementById("qe-delete").hidden = locked;
  var gcalNote = document.getElementById("qe-gcal");
  var gcalLink = document.getElementById("qe-gcal-link");
  var tip = quickEdit.querySelector(".qe-tip");
  if (gcalNote) {
    gcalNote.hidden = !locked;
    gcalNote.textContent = locked ? "From Google Calendar, edit it there." : "";
  }
  if (gcalLink) {
    if (locked && plan.htmlLink) {
      gcalLink.hidden = false;
      gcalLink.href = plan.htmlLink;
    } else {
      gcalLink.hidden = true;
      gcalLink.removeAttribute("href");
    }
  }
  if (tip) tip.hidden = locked;
  if (!locked) {
    paintQuickTypes(plan);
    paintQuickSwatches(plan);
  }
  var mark = board.querySelector('.bar.single[data-id="' + CSS.escape(id) + '"]');
  var anchor = mark || returnEl;
  var box = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 16, top: 16, bottom: 32 };
  placeElement(quickEdit, {
    left: box.left,
    top: box.top,
    bottom: box.bottom,
    fallbackWidth: 260,
    fallbackHeight: 160
  });
  if (locked) {
    focusNoScroll(gcalLink && !gcalLink.hidden ? gcalLink : quickEdit);
  } else {
    qeName.focus();
    qeName.select();
  }
}

function saveQuick(patch) {
  var plan = planById(quickId);
  if (!plan || plan.source === "gcal") return;
  var title = patch && patch.title != null ? String(patch.title).trim() : plan.title;
  if (!title) return;
  var color = patch && patch.color ? patch.color : plan.color;
  var type = patch && patch.type ? patch.type : plan.type;
  if (title === plan.title && color === plan.color && type === plan.type) return;
  var id = plan.id;
  var keepOpen = !patch || patch.title == null;
  var normalized = Planner.makePlan(plan, { title: title, color: color, type: type });
  if (!normalized) return;
  commitEdit(function () {
    plans = plans.map(function (item) { return item.id === id ? normalized : item; });
    selectedId = id;
  }, function () {
    setStatus("Updated " + normalized.title + ".");
    var mark = board.querySelector('.bar.single[data-id="' + CSS.escape(id) + '"]');
    if (keepOpen && mark) openQuickEdit(id, mark);
    else if (mark && mark.focus) mark.focus();
  });
}

function showAddBar(range) {
  var text = Planner.rangeCountLabel(range.start, range.end);
  actionEl.hidden = false;
  actionLabel.textContent = text;
  actionAdd.hidden = false;
  actionAdd.textContent = "Add plan";
  actionEdit.hidden = true;
  actionOpen.hidden = true;
  actionDelete.hidden = true;
  noteShownFor = null;
  noteCard.hidden = true;
  noteCard.replaceChildren();
  return text;
}

function updateAction() {
  var live = arm ? ordered(arm, hoverDate || arm) : null;
  var plan = selectedId ? planById(selectedId) : null;
  if (live) {
    showFloater(showAddBar(live));
    return;
  }
  if (!(gesture && gesture.moved)) hideFloater();
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
    showAddBar(selection);
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

function refreshToday() {
  var today = todayIso();
  board.querySelectorAll(".daynum.today").forEach(function (el) { el.classList.remove("today"); });
  board.querySelectorAll(".month.now").forEach(function (el) { el.classList.remove("now"); });
  board.querySelectorAll(".cell[data-date]").forEach(function (cell) {
    var iso = cell.dataset.date;
    var isToday = iso === today;
    cell.classList.toggle("past", iso < today);
    cell.classList.toggle("today", isToday);
    var letter = cell.querySelector(".wd");
    if (letter) letter.classList.toggle("today", isToday);
  });
  var parts = Planner.parse(today);
  if (!parts) return;
  var head = board.querySelector('.daynum[data-day="' + parts.d + '"]');
  if (head) head.classList.add("today");
  var month = board.querySelector('.month[data-ym="' + today.slice(0, 7) + '"]');
  if (month) month.classList.add("now");
}

function render() {
  var keepYm = null;
  var span = Planner.rollingRange(todayParts(), plans);
  if (span.start !== RANGE_START || span.end !== RANGE_END) {
    var monthsNow = board.querySelectorAll(".month");
    if (monthsNow.length) {
      var edge = board.getBoundingClientRect().top + headHeight() + 2;
      for (var i = 0; i < monthsNow.length; i++) {
        if (monthsNow[i].getBoundingClientRect().bottom > edge) {
          keepYm = monthsNow[i].dataset.ym;
          break;
        }
      }
    }
    RANGE_START = span.start;
    RANGE_END = span.end;
    board.replaceChildren();
  }
  if (selectedId && !planById(selectedId)) selectedId = null;
  renderChrome();
  if (!board.querySelector(".calendar")) buildGrid();
  refreshToday();
  syncBars();
  syncTotals();
  syncTips();
  paintSelection();
  paintFocus();
  if (!noteCard.hidden && selectedId && planById(selectedId)) showNote(planById(selectedId), true);
  applySnapPadding();
  if (keepYm) {
    var kept = keepYm.split("-");
    scrollToMonth(+kept[0], +kept[1], false);
  }
}
