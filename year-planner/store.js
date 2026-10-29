/* Saved plans and image bytes. localStorage key year-planner/v1. */
var STORAGE_KEY = "year-planner/v1";
var RANGE_START = 0;
var RANGE_END = 0;

var yearLabel = document.getElementById("year-label");
var statsEl = document.getElementById("stats");
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
var allDayBtn = document.getElementById("all-day");
var timeFields = document.getElementById("time-fields");
var timeInput = document.getElementById("f-time");
var endTimeInput = document.getElementById("f-end-time");
var whereInput = document.getElementById("f-where");
var mapsLink = document.getElementById("f-maps");
var deleteBtn = document.getElementById("f-delete");
var formError = document.getElementById("f-error");
var rangeFloater = document.getElementById("range-floater");
var tipEl = document.getElementById("tip");
var dayList = document.getElementById("day-list");
var quickEdit = document.getElementById("quick-edit");
var qeName = document.getElementById("qe-name");
var quickId = null;
var quickReturn = null;
var awayPop = document.getElementById("away-pop");
var awayReturn = null;

var year = (function () {
  var stored = +sessionStorage.getItem("year-planner/year");
  if (stored >= 1970 && stored <= 2100) return stored;
  return new Date().getFullYear();
})();
var showHolidays = (function () {
  try {
    var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && raw.showHolidays === false) return false;
  } catch (err) { /* a broken save keeps the default, which is on */ }
  return true;
})();
var plans = load();
var imagesById = Object.create(null);
var editingId = null;
var selection = null;
var selectedId = null;
var arm = null;
var hoverDate = null;
var focusDate = null;
var gesture = null;
var boardDrag = null;
var flingId = 0;
var pointerXY = null;
var suppressClick = false;
var draftImages = [];
var draftChecks = [];
var spanMode = "trip";
var draftType = "Trip";
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
    /* a broken save starts empty rather than the sample year */
  }
  return [];
}

var IMAGE_DB = "year-planner";
var IMAGE_STORE = "images";
var imageDb = null;

function storedPlan(plan) {
  var stored = {
    id: plan.id,
    title: plan.title,
    tag: plan.tag,
    color: plan.color,
    note: plan.note || "",
    start: plan.start,
    end: plan.end
  };
  if (plan.type) stored.type = plan.type;
  if (plan.time) stored.time = plan.time;
  if (plan.endTime) stored.endTime = plan.endTime;
  if (plan.location) stored.location = plan.location;
  if (plan.checklist && plan.checklist.length) stored.checklist = plan.checklist;
  copyGcal(stored, plan);
  return stored;
}

function copyGcal(target, plan) {
  if (!plan) return target;
  if (plan.source === "gcal") target.source = "gcal";
  if (plan.gcalId) target.gcalId = plan.gcalId;
  if (plan.etag) target.etag = plan.etag;
  if (plan.htmlLink) target.htmlLink = plan.htmlLink;
  if (plan.gcalCal) target.gcalCal = plan.gcalCal;
  return target;
}

function cleanImages(list) {
  var images = [];
  if (!Array.isArray(list)) return images;
  list.forEach(function (item) {
    if (!item || typeof item.src !== "string" || item.src.indexOf("data:image/") !== 0) return;
    if (images.length >= 4) return;
    images.push({ name: String(item.name || "image").slice(0, 80), src: item.src });
  });
  return images;
}

function syncImageIndex() {
  plans.forEach(function (plan) {
    imagesById[plan.id] = plan.images || [];
  });
}

function openImageDb() {
  if (imageDb) return Promise.resolve(imageDb);
  if (!window.indexedDB) return Promise.reject(new Error("no indexedDB"));
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(IMAGE_DB, 1);
    request.onupgradeneeded = function () {
      if (!request.result.objectStoreNames.contains(IMAGE_STORE)) {
        request.result.createObjectStore(IMAGE_STORE);
      }
    };
    request.onsuccess = function () {
      imageDb = request.result;
      resolve(imageDb);
    };
    request.onerror = function () { reject(request.error || new Error("indexedDB")); };
  });
}

function readImages() {
  return openImageDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IMAGE_STORE, "readonly");
      var store = tx.objectStore(IMAGE_STORE);
      var out = Object.create(null);
      var cursor = store.openCursor();
      cursor.onsuccess = function () {
        var row = cursor.result;
        if (!row) return;
        out[row.key] = row.value;
        row.continue();
      };
      tx.oncomplete = function () { resolve(out); };
      tx.onerror = function () { reject(tx.error || new Error("indexedDB")); };
    });
  });
}

function writeImages(list) {
  return openImageDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IMAGE_STORE, "readwrite");
      var store = tx.objectStore(IMAGE_STORE);
      var keep = Object.create(null);
      list.forEach(function (plan) {
        keep[plan.id] = true;
        var images = cleanImages(plan.images);
        if (images.length) store.put(images, plan.id);
        else store.delete(plan.id);
      });
      var cursor = store.openCursor();
      cursor.onsuccess = function () {
        var row = cursor.result;
        if (!row) return;
        if (!keep[row.key]) row.delete();
        row.continue();
      };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error("indexedDB")); };
      tx.onabort = function () { reject(tx.error || new Error("indexedDB")); };
    });
  });
}

function plansHaveImages(list) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].images && list[i].images.length) return true;
  }
  return false;
}

function holidayPayload(raw) {
  var doc = raw && typeof raw === "object" && Array.isArray(raw.plans) ? raw : { version: 1, plans: plans.map(storedPlan) };
  if (showHolidays) delete doc.showHolidays;
  else doc.showHolidays = false;
  return doc;
}

function persistHolidayPref() {
  try {
    var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holidayPayload(raw)));
  } catch (err) { /* private mode keeps the choice for this visit */ }
}

function paintHolidayToggle() {
  document.body.classList.toggle("show-holidays", showHolidays);
  var button = document.getElementById("hol-btn");
  if (!button) return;
  button.setAttribute("aria-pressed", showHolidays ? "true" : "false");
  var label = showHolidays ? "Hide holidays" : "Show holidays";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function save() {
  var payload = JSON.stringify(holidayPayload(null));
  var previous;
  try {
    previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (err) {
    return Promise.resolve(false);
  }
  var needsImages = plansHaveImages(plans);
  if (!window.indexedDB) {
    if (!needsImages) return Promise.resolve(true);
    try {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    } catch (err) { /* leave the failed write as-is if we cannot restore */ }
    return Promise.resolve(false);
  }
  return writeImages(plans).then(function () {
    syncImageIndex();
    return true;
  }).catch(function () {
    if (!needsImages) return true;
    try {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    } catch (err) { /* metadata restore failed */ }
    return false;
  });
}

function hydrateImages() {
  plans.forEach(function (plan) {
    plan.images = cleanImages(plan.images);
    if (plan.images.length) imagesById[plan.id] = plan.images;
  });
  var inline = plansHaveImages(plans);
  if (!window.indexedDB) return Promise.resolve();
  return readImages().then(function (stored) {
    plans.forEach(function (plan) {
      var fromDb = cleanImages(stored[plan.id]);
      if (plan.images && plan.images.length) imagesById[plan.id] = plan.images;
      else if (fromDb.length) {
        plan.images = fromDb;
        imagesById[plan.id] = fromDb;
      }
    });
    if (inline) return save();
  }).catch(function () { /* keep whatever load() already attached */ });
}

function snapshotState() {
  return {
    plans: plans,
    selectedId: selectedId,
    selection: selection,
    year: year,
    focusDate: focusDate
  };
}

function restoreState(state) {
  plans = state.plans;
  selectedId = state.selectedId;
  selection = state.selection;
  year = state.year;
  focusDate = state.focusDate;
}

function commitEdit(apply, done) {
  var before = snapshotState();
  remember();
  apply();
  return save().then(function (stored) {
    if (!stored) {
      undoStack.pop();
      paintUndo();
      restoreState(before);
      setStatus("Couldn't store the plans in this browser. Export a backup to keep them.");
      render();
      syncTools();
      return false;
    }
    if (done) done();
    render();
    syncTools();
    return true;
  });
}

function todayParts() {
  var now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function setStatus(text) {
  statusEl.textContent = text || "";
  paintUndo();
}

function paintUndo() {
  var fresh = /^Moved /.test(statusEl.textContent || "");
  undoBtn.hidden = undoStack.length === 0;
  undoBtn.classList.toggle("is-fresh", !undoBtn.hidden && fresh);
  undoBtn.textContent = !undoBtn.hidden && fresh ? "Undo move" : "Undo";
}

function planMeta(plan) {
  var meta = {
    id: plan.id,
    title: plan.title,
    tag: plan.tag,
    color: plan.color,
    note: plan.note,
    start: plan.start,
    end: plan.end
  };
  if (plan.type) meta.type = plan.type;
  if (plan.checklist && plan.checklist.length) meta.checklist = plan.checklist;
  copyGcal(meta, plan);
  return meta;
}

function remember() {
  undoStack.push({
    plans: plans.map(planMeta),
    year: year,
    selectedId: selectedId,
    selection: selection ? { start: selection.start, end: selection.end } : null,
    focusDate: focusDate
  });
  if (undoStack.length > 30) undoStack.shift();
  paintUndo();
}

function plansFromSnapshot(list) {
  return list.map(function (plan) {
    var copy = planMeta(plan);
    copy.images = imagesById[plan.id] ? imagesById[plan.id].slice() : [];
    return Planner.makePlan(copy) || copy;
  });
}

function undo() {
  var snap = undoStack.pop();
  paintUndo();
  if (!snap) return;
  var before = snapshotState();
  plans = plansFromSnapshot(snap.plans);
  year = snap.year;
  selectedId = snap.selectedId;
  selection = snap.selection;
  focusDate = snap.focusDate || null;
  arm = null;
  hoverDate = null;
  noteDismissedFor = selectedId;
  noteShownFor = null;
  noteCard.hidden = true;
  noteCard.replaceChildren();
  var metaNow = snap.gcalMeta && typeof gcalReadMeta === "function" ? gcalReadMeta() : null;
  if (snap.gcalMeta && typeof gcalRestoreMeta === "function") gcalRestoreMeta(snap.gcalMeta);
  save().then(function (stored) {
    if (!stored) {
      restoreState(before);
      if (metaNow && typeof gcalRestoreMeta === "function") gcalRestoreMeta(metaNow);
      undoStack.push(snap);
      paintUndo();
      setStatus("Couldn't store the plans in this browser. Export a backup to keep them.");
      render();
      syncTools();
      return;
    }
    setStatus("Undid the last change.");
    render();
    syncTools();
  });
}


function newId(suffix) {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + suffix;
}

function dedupeIds(list) {
  var seen = Object.create(null);
  return list.map(function (plan, index) {
    var copy = Planner.makePlan(plan, {});
    if (!copy) return plan;
    if (!copy.id || seen[copy.id]) copy = Planner.makePlan(copy, { id: newId(index) });
    seen[copy.id] = true;
    return copy;
  });
}

function mergeById(current, incoming) {
  return Planner.mergePlans(current, incoming, function () { return newId(0); });
}

function askImport(count, singular) {
  var chooser = document.getElementById("import-mode");
  var text = document.getElementById("import-mode-text");
  var one = singular || "plan";
  if (!chooser || typeof chooser.showModal !== "function") {
    if (window.confirm("Replace all current plans with " + Planner.plural(count, "imported " + one) + "?")) return Promise.resolve("replace");
    if (window.confirm("Merge " + Planner.plural(count, "imported " + one) + " into the current list?")) return Promise.resolve("merge");
    return Promise.resolve("cancel");
  }
  text.textContent = "This file has " + Planner.plural(count, one) + ". Replace the current list, or merge them in?";
  return new Promise(function (resolve) {
    function onClose() {
      chooser.removeEventListener("close", onClose);
      resolve(chooser.returnValue || "cancel");
    }
    chooser.addEventListener("close", onClose);
    chooser.showModal();
  });
}

function adoptPlans(next, skipped, singular) {
  var unique = dedupeIds(next);
  askImport(unique.length, singular).then(function (mode) {
    if (mode !== "replace" && mode !== "merge") {
      setStatus("Import cancelled.");
      return;
    }
    var beforeCount = plans.length;
    var merged = mode === "merge" ? dedupeIds(mergeById(plans, unique)) : unique;
    var identical = mode === "merge" ? Math.max(0, beforeCount + unique.length - merged.length) : 0;
    commitEdit(function () {
      plans = merged;
      selectedId = null;
      selection = null;
      arm = null;
      hoverDate = null;
    }, function () {
      setStatus(Planner.importStatus(mode, merged.length - beforeCount, unique.length, identical, skipped, singular));
    });
  });
}

document.getElementById("import").addEventListener("click", function () {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", function (event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (Planner.backupTooLarge(file.size)) {
    setStatus("That file is over 20 MB.");
    return;
  }
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
    if (data !== null && typeof data !== "object") {
      setStatus("That file is not a backup.");
      return;
    }
    var next = [];
    var skipped = 0;
    list.forEach(function (item) {
      if (!item || typeof item !== "object" || Array.isArray(item)) { skipped += 1; return; }
      var plan = Planner.makePlan(null, item);
      if (!plan) { skipped += 1; return; }
      if (!plan.id) plan.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + next.length;
      next.push(plan);
    });
    if (!next.length) {
      setStatus("No plans found in that backup.");
      return;
    }
    adoptPlans(next, skipped, "plan");
  });
});

document.addEventListener("keydown", function (event) {
  var tag = event.target && event.target.tagName;
  var typing = tag === "INPUT" || tag === "TEXTAREA" || (event.target && event.target.isContentEditable);
  if (event.key === "Escape" && event.target === search) {
    event.preventDefault();
    if (search.value) {
      search.value = "";
      render();
      search.focus();
    } else {
      search.blur();
    }
    return;
  }
  var pinConfirm = document.getElementById("pin-confirm");
  if (pinConfirm && !pinConfirm.hidden && event.key === "Escape") {
    event.preventDefault();
    if (typeof closePinConfirm === "function") closePinConfirm();
    return;
  }
  if (awayPop && !awayPop.hidden && event.key === "Escape") {
    event.preventDefault();
    closeAwayPop(true);
    return;
  }
  if (quickEdit && !quickEdit.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeQuickEdit(true);
      return;
    }
    if (event.key === "Tab") {
      var items = Array.prototype.slice.call(quickEdit.querySelectorAll("input, button")).filter(function (el) {
        return !el.disabled;
      });
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "Enter" && event.target === qeName) {
      event.preventDefault();
      var typed = qeName.value.trim();
      var current = planById(quickId);
      if (current && typed && typed !== current.title) saveQuick({ title: typed });
      else closeQuickEdit(true);
      return;
    }
  }
  if (event.key === "Escape" && (gesture || rangeDrag)) {
    rangeDrag = null;
    gesture = null;
    clearDrop();
    hideFloater();
    setStatus("");
    render();
    return;
  }
  if (event.key === "Escape" && dayList && !dayList.hidden) {
    closeDayList();
    return;
  }
  var help = document.getElementById("help");
  if (event.key === "Escape" && help.open) {
    help.close();
    return;
  }
  var importMode = document.getElementById("import-mode");
  if (event.key === "Escape" && importMode && importMode.open) return;
  if (event.key === "Escape" && !dialog.open) {
    rangeDrag = null;
    selection = null;
    arm = null;
    hoverDate = null;
    selectedId = null;
    focusDate = null;
    paintSelection();
    paintFocus();
    board.querySelectorAll(".bar.selected").forEach(function (bar) { bar.classList.remove("selected"); });
    return;
  }
  if (event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
      && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      && selection && !selectedId && !dialog.open && !(help && help.open)
      && (!quickEdit || quickEdit.hidden)) {
    event.preventDefault();
    nudgeQuickRange(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (typing || dialog.open || help.open) return;
  var markerKey = document.activeElement && document.activeElement.closest && document.activeElement.closest(".bar.single");
  if (markerKey && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openQuickEdit(markerKey.dataset.id, markerKey);
    return;
  }
  if (event.key === "t" || event.key === "T") {
    document.getElementById("today").click();
  } else if (event.key === "w" || event.key === "W") {
    event.preventDefault();
    if (typeof togglePin === "function") togglePin();
  } else if ((event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.repeat || document.querySelector("dialog[open]")) return;
    event.preventDefault();
    if (typeof toggleFullscreen === "function") toggleFullscreen();
  } else if (event.key === "[") {
    if (year > RANGE_START) scrollToMonth(year - 1, 1, true);
  } else if (event.key === "]") {
    if (year < RANGE_END) scrollToMonth(year + 1, 1, true);
  } else if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
    event.preventDefault();
    openHelp("shortcuts");
  } else if (event.key === "n" || event.key === "N" || event.key === "a") {
    var iso = focusDate || (selection && selection.start) || todayIso();
    openEditor(null, { start: iso, end: (selection && selection.end) || iso });
  } else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    scrollByMonths(event.key === "PageUp" ? -6 : 6);
  } else if (event.key === "Home") {
    event.preventDefault();
    scrollToMonth(RANGE_START, 1, true);
  } else if (event.key === "End") {
    event.preventDefault();
    scrollToMonth(RANGE_END, 12, true);
  } else if (event.key === "Enter") {
    var chosen = selectedId ? planById(selectedId) : null;
    if (!chosen && focusDate) {
      var onDay = plansOn(focusDate);
      if (onDay.length) chosen = onDay[0];
    }
    if (chosen) openEditor(chosen);
    else if (focusDate) openEditor(null, { start: focusDate, end: focusDate });
    else if (selection) addFromSelection(false);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && (event.shiftKey || !focusDate)) {
      event.preventDefault();
      scrollByMonths(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.shiftKey && selection && !selectedId && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      nudgeQuickRange(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    event.preventDefault();
    var dayDelta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    var monthDelta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    var base = Planner.parse(focusDate || (selection && selection.start) || todayIso());
    var nextIso;
    if (dayDelta) {
      nextIso = Planner.addDays(cellDate(base.y, base.m, base.d), dayDelta);
    } else {
      var y = base.y;
      var m = base.m + monthDelta;
      while (m < 1) { m += 12; y -= 1; }
      while (m > 12) { m -= 12; y += 1; }
      var d = Math.min(base.d, Planner.daysInMonth(y, m));
      nextIso = cellDate(y, m, d);
    }
    var next = Planner.parse(nextIso);
    if (!next || next.y < RANGE_START || next.y > RANGE_END) return;
    focusDate = nextIso;
    paintFocus();
    var cell = board.querySelector('.cell[data-date="' + focusDate + '"]');
    if (cell) {
      var top = cell.getBoundingClientRect().top - board.getBoundingClientRect().top;
      if (top < headHeight() || top > board.clientHeight - 40) scrollToMonth(next.y, next.m, true);
    }
  } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
    event.preventDefault();
    var doomed = planById(selectedId);
    if (doomed && doomed.source === "gcal") {
      setStatus("That plan comes from Google Calendar. Disconnect to remove it.");
      return;
    }
    deletePlan(selectedId);
  } else if (event.key === "/") {
    event.preventDefault();
    search.focus();
  }
});

function onPointerCancel() {
  if (boardDrag) {
    boardDrag = null;
    board.classList.remove("panning");
    if (flingId) cancelAnimationFrame(flingId);
    flingId = 0;
  }
  var dragging = !!(gesture || (rangeDrag && rangeDrag.moved));
  rangeDrag = null;
  gesture = null;
  hideFloater();
  clearDrop();
  if (!dragging) return;
  arm = null;
  hoverDate = null;
  render();
}

board.addEventListener("click", function (event) {
  var awayHead = event.target.closest && event.target.closest(".away-head");
  if (awayHead) {
    event.preventDefault();
    openAwayExplainer(awayHead);
    return;
  }
  var total = event.target.closest && event.target.closest(".month-total");
  if (total) {
    event.preventDefault();
    openAwayMonth(total.dataset.ym, total);
    return;
  }
  var mark = event.target.closest && event.target.closest(".bar.single");
  if (mark) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    event.preventDefault();
    openQuickEdit(mark.dataset.id, mark);
    return;
  }
  var more = event.target.closest && event.target.closest(".single-more");
  if (more) {
    event.preventDefault();
    openDayList(more.dataset.date, more);
    return;
  }
  var span = event.target.closest && event.target.closest(".bar");
  if (span && !span.classList.contains("single")) {
    var whole = planById(span.dataset.id);
    if (whole && whole.source === "gcal") {
      event.preventDefault();
      openEditor(whole);
      return;
    }
  }
  onCellClick(event);
});
board.addEventListener("dblclick", function (event) {
  var bar = event.target.closest && event.target.closest(".bar");
  if (!bar || bar.classList.contains("single")) return;
  var plan = planById(bar.dataset.id);
  if (!plan) return;
  event.preventDefault();
  selectedId = plan.id;
  selection = { start: plan.start, end: plan.end };
  focusDate = plan.start;
  openEditor(plan, null, true);
});
board.addEventListener("pointerdown", function (event) {
  if (event.button !== 0) return;
  pointerXY = { x: event.clientX, y: event.clientY };
  if (event.target.closest && event.target.closest("[data-act], .plan-tools, #day-list, #quick-edit")) return;
  var singleMark = event.target.closest && event.target.closest(".bar.single");
  if (singleMark) {
    var singlePlan = planById(singleMark.dataset.id);
    if (singlePlan && singlePlan.source === "gcal") return;
    var singleCell = board.querySelector(".cell[data-date]");
    var singleBox = singleCell ? singleCell.getBoundingClientRect() : null;
    gesture = {
      kind: "plan",
      where: "body",
      mode: "move",
      single: true,
      id: singleMark.dataset.id,
      originStart: singleMark.dataset.date,
      originEnd: singleMark.dataset.date,
      grabDate: singleMark.dataset.date,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      cellWidth: singleBox && singleBox.width ? singleBox.width : 32,
      cellHeight: singleBox && singleBox.height ? singleBox.height : 48
    };
    return;
  }
  if (event.target.closest && event.target.closest(".single-more")) return;
  var scroller = event.target.closest && event.target.closest(".month, .year-divider");
  if (scroller) {
    startBoardDrag(event);
    return;
  }
  var fill = event.target.closest && event.target.closest(".fill");
  if (fill) {
    onBarDown(event);
    return;
  }
});
board.addEventListener("pointerover", function (event) {
  var mark = event.target.closest && event.target.closest(".bar.single, .single-more");
  if (!mark) return;
  showTip(mark.dataset.date, event.clientX, event.clientY);
});
board.addEventListener("pointerout", function (event) {
  var mark = event.target.closest && event.target.closest(".bar.single, .single-more");
  if (!mark) return;
  var next = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(".bar.single, .single-more");
  if (next && next.dataset.date === mark.dataset.date) return;
  hideTip();
});
board.addEventListener("wheel", function () {
  if (flingId) cancelAnimationFrame(flingId);
  flingId = 0;
  scrollGen += 1;
  if (!boardDrag) board.classList.remove("panning");
}, { passive: true });
board.addEventListener("scroll", function () {
  closeDayList();
  closeQuickEdit(false);
  closeAwayPop(false);
  hideTip();
  if (board.dataset.ticking) return;
  board.dataset.ticking = "1";
  requestAnimationFrame(function () {
    board.dataset.ticking = "";
    updateViewYear();
    if (typeof placeQuickAdd === "function") placeQuickAdd();
    if (typeof placeSelectionHandle === "function") placeSelectionHandle();
    if (awayPop && !awayPop.hidden && awayReturn && awayReturn.isConnected && typeof placeAwayPop === "function") {
      placeAwayPop(awayReturn);
    }
  });
});

document.addEventListener("pointerdown", function (event) {
  pointerXY = { x: event.clientX, y: event.clientY };
  var pinConfirm = document.getElementById("pin-confirm");
  if (pinConfirm && !pinConfirm.hidden && !pinConfirm.contains(event.target) && !(event.target.closest && event.target.closest("#pin-desk"))) {
    if (typeof closePinConfirm === "function") closePinConfirm();
  }
  if (awayPop && !awayPop.hidden && !awayPop.contains(event.target) && !(event.target.closest && event.target.closest(".away-head, .month-total"))) {
    closeAwayPop(false);
  }
  if (quickEdit && !quickEdit.hidden && !quickEdit.contains(event.target)) closeQuickEdit(false);
  if (dayList && !dayList.hidden && !dayList.contains(event.target) && !(event.target.closest && event.target.closest(".bar.single, .single-more"))) {
    closeDayList();
  }
  if (actionEl.hidden) return;
  if (actionEl.contains(event.target)) return;
  if (event.target.closest && event.target.closest(".cell[data-date], .bar, .month, .year-divider, .single-more, #add, #today, #today-title, #day-list, #range-handle")) return;
  selection = null;
  arm = null;
  hoverDate = null;
  paintSelection();
});

dialog.addEventListener("click", function (event) {
  if (event.target === dialog) closeEditor();
});

document.getElementById("qe-delete").addEventListener("click", function () {
  var id = quickId;
  if (!id) return;
  closeQuickEdit(false);
  deletePlan(id);
});
document.getElementById("qe-more").addEventListener("click", function () {
  var plan = planById(quickId);
  closeQuickEdit(false);
  if (plan) openEditor(plan);
});

function download(filename, text, type) {
  var blob = new Blob([text], { type: type });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function escapeIcs(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function unescapeIcs(text) {
  return String(text || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function plansToIcs(list) {
  var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Oma Year Planner//EN", "CALSCALE:GREGORIAN"];
  list.forEach(function (plan) {
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + plan.id + "@year-planner");
    lines.push("SUMMARY:" + escapeIcs(plan.title));
    var bounds = Planner.icsBounds(plan);
    lines.push(bounds.start);
    lines.push(bounds.end);
    if (plan.location) lines.push("LOCATION:" + escapeIcs(plan.location));
    if (plan.note) lines.push("DESCRIPTION:" + escapeIcs(plan.note));
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function plansFromIcs(text) {
  var unfolded = String(text || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  if (unfolded.indexOf("BEGIN:VCALENDAR") === -1) return { error: "That file is not a calendar." };
  var blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  var next = [];
  var skipped = 0;
  blocks.forEach(function (block) {
    var body = block.split("END:VEVENT")[0];
    var summary = "";
    var startLine = "";
    var endLine = "";
    var note = "";
    var where = "";
    var uid = "";
    body.split(/\r?\n/).forEach(function (line) {
      var cut = line.indexOf(":");
      if (cut < 1) return;
      var key = line.slice(0, cut).split(";")[0].toUpperCase();
      var value = line.slice(cut + 1).trim();
      if (key === "SUMMARY") summary = unescapeIcs(value);
      if (key === "DESCRIPTION") note = unescapeIcs(value);
      if (key === "LOCATION") where = unescapeIcs(value);
      if (key === "UID") uid = value;
      if (key === "DTSTART") startLine = line.trim();
      if (key === "DTEND") endLine = line.trim();
    });
    var span = Planner.readIcsSpan(startLine, endLine);
    if (!span) { skipped += 1; return; }
    var plan = Planner.makePlan(null, {
      id: uid ? uid.split("@")[0] : "",
      title: summary || "Plan",
      note: note,
      location: where,
      time: span.time,
      endTime: span.endTime,
      start: span.start,
      end: span.end
    });
    if (!plan) { skipped += 1; return; }
    if (!plan.id) plan.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + next.length;
    next.push(plan);
  });
  return { plans: next, skipped: skipped };
}

document.getElementById("export-ics").addEventListener("click", function () {
  download("year-planner.ics", plansToIcs(plans), "text/calendar");
  setStatus("Exported " + Planner.plural(plans.length, "plan") + " as a calendar.");
});
document.getElementById("import-ics").addEventListener("click", function () {
  document.getElementById("import-ics-file").click();
});
document.getElementById("import-ics-file").addEventListener("change", function (event) {
  var file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (Planner.backupTooLarge(file.size)) {
    setStatus("That file is over 20 MB.");
    return;
  }
  file.text().then(function (text) {
    var parsed = plansFromIcs(text);
    if (parsed.error) { setStatus(parsed.error); return; }
    if (!parsed.plans.length) { setStatus("No events found in that calendar."); return; }
    adoptPlans(parsed.plans, parsed.skipped, "event");
  });
});

var minuteTimer = 0;
var midnightTimer = 0;
paintHolidayToggle();
