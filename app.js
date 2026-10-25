/* Year planner UI. Plans live in localStorage under year-planner/v1.
   The visible span is one continuous scroll. Change the years here. */
(function () {
  var STORAGE_KEY = "year-planner/v1";
  var RANGE_START = 2026;
  var RANGE_END = 2027;

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
  var deleteBtn = document.getElementById("f-delete");
  var formError = document.getElementById("f-error");

  var year = (function () {
    var stored = +sessionStorage.getItem("year-planner/year");
    if (stored >= 1970 && stored <= 2100) return stored;
    return new Date().getFullYear();
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
  var createDrag = null;
  var suppressClick = false;
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

  var IMAGE_DB = "year-planner";
  var IMAGE_STORE = "images";
  var imageDb = null;

  function storedPlan(plan) {
    return {
      id: plan.id,
      title: plan.title,
      tag: plan.tag,
      color: plan.color,
      note: plan.note || "",
      start: plan.start,
      end: plan.end
    };
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

  function save() {
    var payload = JSON.stringify({ version: 1, plans: plans.map(storedPlan) });
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
  }

  function paintUndo() {
    undoBtn.hidden = undoStack.length === 0;
  }

  function planMeta(plan) {
    return {
      id: plan.id,
      title: plan.title,
      tag: plan.tag,
      color: plan.color,
      note: plan.note,
      start: plan.start,
      end: plan.end
    };
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
      return copy;
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
    save().then(function (stored) {
      if (!stored) {
        restoreState(before);
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

  function visible() {
    return Planner.filterPlans(plans, RANGE_START + "-01-01", RANGE_END + "-12-31", "all", search.value);
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
    renderRhythm();
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

  var rhythmNext = null;
  var rhythmLast = null;

  function focusPlan(plan) {
    var start = Planner.parse(plan.start);
    selectedId = plan.id;
    selection = { start: plan.start, end: plan.end };
    focusDate = plan.start;
    arm = null;
    hoverDate = null;
    noteDismissedFor = plan.id;
    noteShownFor = null;
    noteCard.hidden = true;
    noteCard.replaceChildren();
    setStatus(plan.title + " · " + rangeLabel(plan));
    render();
    syncTools();
    if (start) scrollToMonth(start.y, start.m, true);
  }

  function dayPhrase(n, soon) {
    var word = n === 1 ? "day" : "days";
    return soon ? "in " + n + " " + word : n + " " + word + " ago";
  }

  function renderRhythm() {
    var today = todayIso();
    var past = null;
    var future = null;
    plans.forEach(function (plan) {
      if (plan.end < today && (!past || plan.end > past.end)) past = plan;
      if (plan.start > today && (!future || plan.start < future.start)) future = plan;
    });
    rhythmNext = future;
    rhythmLast = past;
    var parts = [];
    if (future) parts.push("Next: " + future.title + " " + dayPhrase(Planner.diffDays(today, future.start), true));
    if (past) parts.push("Last: " + past.title + " " + dayPhrase(Planner.diffDays(past.end, today), false));
    var line = document.getElementById("rhythm");
    if (line) line.textContent = parts.length ? parts.join(" · ") : "No plans before or after today.";
  }

  function cellDate(y, m, d) {
    return y + "-" + Planner.pad(m) + "-" + Planner.pad(d);
  }

  function dateFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var cell = el.closest && el.closest(".cell[data-date]");
    if (cell) return cell.dataset.date;
    var cover = el.closest && (el.closest(".fill") || el.closest(".bar"));
    if (!cover) return null;
    var previous = cover.style.pointerEvents;
    cover.style.pointerEvents = "none";
    var under = document.elementFromPoint(x, y);
    cover.style.pointerEvents = previous;
    cell = under && under.closest && under.closest(".cell[data-date]");
    return cell ? cell.dataset.date : null;
  }

  function todayIso() {
    var now = new Date();
    return cellDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function buildGrid() {
    var months = Planner.monthsInRange(RANGE_START, RANGE_END);
    var calendar = document.createElement("div");
    calendar.className = "calendar";
    calendar.setAttribute("role", "grid");
    calendar.setAttribute("aria-label", RANGE_START + " through " + RANGE_END);
    var today = todayIso();

    function head(className, text, column) {
      var el = document.createElement("div");
      el.className = className + " dayhead";
      el.textContent = text;
      el.style.gridColumn = String(column);
      el.style.gridRow = "1";
      return el;
    }

    calendar.append(head("corner", "Month", 1));
    for (var day = 1; day <= 31; day++) {
      var num = head("daynum", Planner.pad(day), day + 1);
      num.dataset.day = String(day);
      calendar.append(num);
    }
    var away = head("away-head", "Away", 33);
    away.title = "Days away this month";
    calendar.append(away);

    var row = 2;
    months.forEach(function (month, index) {
      if (month.m === 1 && index > 0) {
        var divider = document.createElement("div");
        divider.className = "year-divider";
        divider.textContent = String(month.y);
        divider.style.gridRow = String(row);
        calendar.append(divider);
        row += 1;
      }
      var key = month.y + "-" + Planner.pad(month.m);
      var label = document.createElement("div");
      label.className = "month";
      label.dataset.ym = key;
      label.dataset.row = String(row);
      if (key === today.slice(0, 7)) label.classList.add("now");
      var monthNum = document.createElement("span");
      monthNum.className = "num";
      monthNum.textContent = Planner.pad(month.m);
      var monthName = document.createElement("span");
      monthName.className = "name";
      monthName.textContent = Planner.MONTHS[month.m - 1];
      label.append(monthNum, monthName);
      label.style.gridColumn = "1";
      label.style.gridRow = String(row);
      calendar.append(label);

      var dim = Planner.daysInMonth(month.y, month.m);
      for (var d = 1; d <= 31; d++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridColumn = String(d + 1);
        cell.style.gridRow = String(row);
        if (d > dim) {
          cell.classList.add("void");
        } else {
          var iso = cellDate(month.y, month.m, d);
          cell.dataset.date = iso;
          var letter = document.createElement("span");
          letter.className = "wd";
          letter.textContent = Planner.weekdayLetter(month.y, month.m, d);
          if (Planner.weekday(month.y, month.m, d) === 0) {
            cell.classList.add("weekend");
            letter.classList.add("sun");
          }
          if (iso < today) cell.classList.add("past");
          if (iso === today) {
            cell.classList.add("today");
            letter.classList.add("today");
            var headDay = calendar.querySelector('.daynum[data-day="' + d + '"]');
            if (headDay) headDay.classList.add("today");
          }
          cell.append(letter);
        }
        calendar.append(cell);
      }
      var total = document.createElement("div");
      total.className = "month-total zero";
      total.dataset.ym = key;
      total.style.gridColumn = "33";
      total.style.gridRow = String(row);
      total.textContent = "0";
      total.title = "Days away";
      calendar.append(total);
      row += 1;
    });

    board.replaceChildren(calendar);
  }

  function syncBars() {
    var list = visible();
    var laid = Planner.layout(list, RANGE_START + "-01-01", RANGE_END + "-12-31");
    board.querySelectorAll(".bar").forEach(function (bar) { bar.remove(); });
    var tooled = {};
    var calendar = board.querySelector(".calendar");
    if (!calendar) return;
    laid.bars.forEach(function (bar) {
      var plan = bar.plan;
      var host = board.querySelector('.month[data-ym="' + bar.y + "-" + Planner.pad(bar.month) + '"]');
      if (!host) return;
      var el = document.createElement("button");
      el.type = "button";
      el.className = "bar";
      if (bar.continuesBefore) el.classList.add("cont-before");
      if (bar.continuesAfter) el.classList.add("cont-after");
      if (plan.id === selectedId) el.classList.add("selected");
      el.style.setProperty("--cat", plan.color || "#74a869");
      el.style.gridColumn = (bar.startDay + 1) + " / " + (bar.endDay + 2);
      el.style.gridRow = host.dataset.row;
      el.style.setProperty("--lane", String(bar.lane));
      el.style.setProperty("--lanes", String(laid.lanes[bar.y + "-" + Planner.pad(bar.month)] || 1));
      el.dataset.id = plan.id;
      el.title = plan.title + " · " + bar.days + "d";

      var fill = document.createElement("span");
      fill.className = "fill";
      if (bar.endDay === bar.startDay && !bar.continuesBefore && !bar.continuesAfter) fill.classList.add("single");
      if (bar.continuesBefore) {
        var before = document.createElement("span");
        before.className = "edge";
        before.textContent = "‹";
        fill.append(before);
      }
      var text = document.createElement("span");
      text.className = "label";
      text.textContent = plan.title;
      var count = document.createElement("span");
      count.className = "count";
      count.textContent = " · " + bar.days + "d";
      fill.append(text, count);
      if (bar.continuesAfter) {
        var after = document.createElement("span");
        after.className = "edge";
        after.textContent = "›";
        fill.append(after);
      }
      var planStart = Planner.parse(plan.start);
      var planEnd = Planner.parse(plan.end);
      var atStart = planStart && planStart.y === bar.y && planStart.m === bar.month && planStart.d === bar.startDay;
      var atEnd = planEnd && planEnd.y === bar.y && planEnd.m === bar.month && planEnd.d === bar.endDay;
      if (atStart) fill.append(handle("w"));
      if (atEnd) fill.append(handle("e"));
      if (!tooled[plan.id]) {
        tooled[plan.id] = true;
        fill.append(planTools(plan));
      }
      el.append(fill);
      calendar.append(el);
    });
  }

  function syncTotals() {
    var list = visible();
    board.querySelectorAll(".month-total").forEach(function (node) {
      var parts = node.dataset.ym.split("-");
      var count = Planner.monthDaysAway(list, +parts[0], +parts[1]);
      node.textContent = String(count);
      node.classList.toggle("zero", count === 0);
      node.title = count === 1 ? "1 day away" : count + " days away";
    });
  }

  function syncTips() {
    board.querySelectorAll(".cell[data-date]").forEach(function (cell) {
      var iso = cell.dataset.date;
      var parts = Planner.parse(iso);
      var when = Planner.weekdayLetter(parts.y, parts.m, parts.d) + " " + parts.d + " " + Planner.MONTHS[parts.m - 1] + " " + parts.y;
      var names = plansOn(iso).map(function (plan) { return plan.title; });
      cell.title = names.length ? when + " · " + names.join(", ") : when;
    });
  }

  function paintFocus() {
    board.querySelectorAll(".cell.focus").forEach(function (cell) { cell.classList.remove("focus"); });
    if (!focusDate) return;
    var cell = board.querySelector('.cell[data-date="' + focusDate + '"]');
    if (cell) cell.classList.add("focus");
  }

  function scrollToMonth(y, m, smooth) {
    var label = board.querySelector('.month[data-ym="' + y + "-" + Planner.pad(m) + '"]');
    if (!label) return;
    var top = label.getBoundingClientRect().top - board.getBoundingClientRect().top + board.scrollTop - 26;
    var motion = smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto";
    board.scrollTo({ top: Math.max(0, top), behavior: motion });
  }

  function updateViewYear() {
    var months = board.querySelectorAll(".month");
    var edge = board.getBoundingClientRect().top + 30;
    var found = RANGE_START;
    for (var i = 0; i < months.length; i++) {
      if (months[i].getBoundingClientRect().bottom > edge) {
        found = +months[i].dataset.ym.slice(0, 4);
        break;
      }
    }
    year = found;
    yearLabel.textContent = String(year);
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
    if (!actionEl.hidden) placePopover(actionEl, selection.start);
  }

  function rectsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function placePopover(el, iso) {
    var cell = iso && board.querySelector('.cell[data-date="' + iso + '"]');
    if (!cell) return;
    el.classList.add("anchored");
    var width = el.offsetWidth || 280;
    var height = el.offsetHeight || 48;
    var month = board.querySelector('.month[data-ym="' + iso.slice(0, 7) + '"]');
    var row = (month || cell).getBoundingClientRect();
    var cellRect = cell.getBoundingClientRect();
    var below = row.bottom + 8;
    var above = row.top - height - 8;
    var top = below + height > window.innerHeight - 8 && above > 8 ? above : below;
    var left = cellRect.left + (cellRect.width / 2) - (width / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    el.style.left = left + "px";
    el.style.top = Math.max(8, top) + "px";
    var pop = el.getBoundingClientRect();
    var hits = false;
    board.querySelectorAll(".bar").forEach(function (bar) {
      if (rectsOverlap(pop, bar.getBoundingClientRect())) hits = true;
    });
    if (hits) {
      top = top === below ? above : below;
      el.style.top = Math.max(8, top) + "px";
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
  }

  function listenPointer() {}

  function silencePointer() {}

  function onBarDown(event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    var bar = event.target.closest(".bar");
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
    if (createDrag && !gesture) {
      var over = dateFromPoint(event.clientX, event.clientY);
      if (over && over !== createDrag.iso && Math.hypot(event.clientX - createDrag.x, event.clientY - createDrag.y) > 6) {
        createDrag.moved = true;
        arm = createDrag.iso;
        hoverDate = over;
        paintSelection();
      }
      return;
    }
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
    board.querySelectorAll('.bar[data-id="' + CSS.escape(plan.id) + '"]').forEach(function (bar) {
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
    if (createDrag && !gesture) {
      var drag = createDrag;
      createDrag = null;
      if (drag.moved) {
        suppressClick = true;
        selection = ordered(drag.iso, hoverDate || drag.iso);
        arm = null;
        hoverDate = null;
        focusDate = selection.start;
        clearPlanSelection();
        paintSelection();
        openEditor(null, { start: selection.start, end: selection.end });
      }
      return;
    }
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
    var parts = Planner.parse(normalized.start);
    commitEdit(function () {
      plans = plans.map(function (item) { return item.id === id ? normalized : item; });
      selectedId = normalized.id;
      selection = { start: normalized.start, end: normalized.end };
      focusDate = normalized.start;
    }, function () {
      setStatus("Moved " + normalized.title + " to " + rangeLabel(normalized) + ".");
      if (parts) scrollToMonth(parts.y, parts.m, true);
    });
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
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    var cell = event.target.closest && event.target.closest(".cell[data-date]");
    if (!cell || event.target.closest(".bar")) return;
    var iso = cell.dataset.date;
    focusDate = iso;
    paintFocus();
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
    requestAnimationFrame(function () { placePopover(dialog, start); });
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
    var wasEditing = !!editingId;
    var id = editingId;
    commitEdit(function () {
      if (id) {
        plans = plans.map(function (plan) {
          return plan.id === id ? normalized : plan;
        });
      } else {
        plans = plans.concat([normalized]);
      }
      selectedId = normalized.id;
      selection = { start: normalized.start, end: normalized.end };
      focusDate = normalized.start;
      arm = null;
      hoverDate = null;
      noteDismissedFor = null;
    }, function () {
      closeEditor();
      setStatus((wasEditing ? "Updated " : "Added ") + normalized.title + ".");
      var parts = Planner.parse(normalized.start);
      if (parts) scrollToMonth(parts.y, parts.m, true);
    });
  });

  function deletePlan(id) {
    var plan = planById(id);
    if (!plan) return;
    commitEdit(function () {
      plans = plans.filter(function (item) { return item.id !== id; });
      if (selectedId === id) selectedId = null;
    }, function () {
      setStatus("Deleted " + plan.title + ".");
    });
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
    scrollToMonth(Math.max(RANGE_START, year - 1), 1, true);
  });
  document.getElementById("next").addEventListener("click", function () {
    scrollToMonth(Math.min(RANGE_END, year + 1), 1, true);
  });
  document.getElementById("today-title").addEventListener("click", function () {
    document.getElementById("today").click();
  });

  document.getElementById("today").addEventListener("click", function () {
    var today = todayParts();
    focusDate = cellDate(today.y, today.m, today.d);
    selection = { start: focusDate, end: focusDate };
    arm = null;
    hoverDate = null;
    selectedId = null;
    paintSelection();
    paintFocus();
    scrollToMonth(today.y, today.m, true);
  });

  var rollingBtn = document.getElementById("rolling");
  var rolling = sessionStorage.getItem("year-planner/rolling") === "1";
  function paintRolling() {
    rollingBtn.setAttribute("aria-pressed", rolling ? "true" : "false");
  }
  paintRolling();
  rollingBtn.addEventListener("click", function () {
    rolling = !rolling;
    sessionStorage.setItem("year-planner/rolling", rolling ? "1" : "0");
    paintRolling();
    if (rolling) {
      var today = todayParts();
      scrollToMonth(today.y, today.m, true);
    } else {
      scrollToMonth(year, 1, true);
    }
  });

  document.getElementById("help-btn").addEventListener("click", function () {
    document.getElementById("help").showModal();
  });
  document.getElementById("add").addEventListener("click", function () {
    addFromSelection(false);
  });

  var searchTimer = 0;
  search.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      render();
      search.focus();
    }, 180);
  });

  document.getElementById("rhythm").addEventListener("click", function () {
    if (rhythmNext) focusPlan(rhythmNext);
    else if (rhythmLast) focusPlan(rhythmLast);
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    setStatus("Exported " + plans.length + " plans.");
  });

  function newId(suffix) {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + "-" + suffix;
  }

  function dedupeIds(list) {
    var seen = Object.create(null);
    return list.map(function (plan, index) {
      var copy = {
        id: plan.id,
        title: plan.title,
        tag: plan.tag,
        color: plan.color,
        note: plan.note,
        images: plan.images ? plan.images.slice() : [],
        start: plan.start,
        end: plan.end
      };
      if (!copy.id || seen[copy.id]) copy.id = newId(index);
      seen[copy.id] = true;
      return copy;
    });
  }

  function mergeById(current, incoming) {
    var byId = Object.create(null);
    var order = [];
    current.forEach(function (plan) {
      byId[plan.id] = plan;
      order.push(plan.id);
    });
    incoming.forEach(function (plan) {
      var existing = byId[plan.id];
      if (!existing) order.push(plan.id);
      else if ((!plan.images || !plan.images.length) && existing.images && existing.images.length) {
        plan.images = existing.images.slice();
      }
      byId[plan.id] = plan;
    });
    return order.map(function (id) { return byId[id]; });
  }

  function askImport(count, noun) {
    var chooser = document.getElementById("import-mode");
    var text = document.getElementById("import-mode-text");
    var label = noun || "plans";
    if (!chooser || typeof chooser.showModal !== "function") {
      if (window.confirm("Replace all current plans with the " + count + " imported " + label + "?")) return Promise.resolve("replace");
      if (window.confirm("Merge the imported " + label + " into the current list?")) return Promise.resolve("merge");
      return Promise.resolve("cancel");
    }
    text.textContent = "This file has " + count + " " + label + ". Replace the current list, or merge them in?";
    return new Promise(function (resolve) {
      function onClose() {
        chooser.removeEventListener("close", onClose);
        resolve(chooser.returnValue || "cancel");
      }
      chooser.addEventListener("close", onClose);
      chooser.showModal();
    });
  }

  function adoptPlans(next, skipped, noun) {
    var unique = dedupeIds(next);
    askImport(unique.length, noun).then(function (mode) {
      if (mode !== "replace" && mode !== "merge") {
        setStatus("Import cancelled.");
        return;
      }
      var merged = mode === "merge" ? dedupeIds(mergeById(plans, unique)) : unique;
      commitEdit(function () {
        plans = merged;
        selectedId = null;
        selection = null;
        arm = null;
        hoverDate = null;
      }, function () {
        var verb = mode === "merge" ? "Merged " : "Imported ";
        setStatus(verb + unique.length + " " + noun + (skipped ? ", skipped " + skipped : "") + ".");
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
        var plan = Planner.normalize(item);
        if (!plan) { skipped += 1; return; }
        if (!plan.id) plan.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + next.length;
        next.push(plan);
      });
      if (!next.length) {
        setStatus("No plans found in that backup.");
        return;
      }
      adoptPlans(next, skipped, "plans");
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
    var help = document.getElementById("help");
    if (event.key === "Escape" && help.open) {
      help.close();
      return;
    }
    var importMode = document.getElementById("import-mode");
    if (event.key === "Escape" && importMode && importMode.open) return;
    if (event.key === "Escape" && !dialog.open) {
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
    if (typing || dialog.open || help.open) return;
    if (event.key === "t" || event.key === "T") {
      document.getElementById("today").click();
    } else if (event.key === "[") {
      scrollToMonth(Math.max(RANGE_START, year - 1), 1, true);
    } else if (event.key === "]") {
      scrollToMonth(Math.min(RANGE_END, year + 1), 1, true);
    } else if (event.key === "?" ) {
      help.showModal();
    } else if (event.key === "n" || event.key === "N" || event.key === "a") {
      var iso = focusDate || (selection && selection.start) || todayIso();
      openEditor(null, { start: iso, end: (selection && selection.end) || iso });
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
        if (top < 26 || top > board.clientHeight - 40) scrollToMonth(next.y, next.m, true);
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
      event.preventDefault();
      deletePlan(selectedId);
    } else if (event.key === "/") {
      event.preventDefault();
      search.focus();
    }
  });

  function onPointerCancel() {
    var dragging = !!(gesture || (createDrag && createDrag.moved));
    createDrag = null;
    gesture = null;
    clearDrop();
    if (!dragging) return;
    arm = null;
    hoverDate = null;
    render();
  }

  window.addEventListener("pointermove", onArmMove);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);

  board.addEventListener("click", onCellClick);
  board.addEventListener("dblclick", function (event) {
    var bar = event.target.closest && event.target.closest(".bar");
    if (!bar) return;
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
    if (event.target.closest && event.target.closest("[data-act], .plan-tools")) return;
    var fill = event.target.closest && event.target.closest(".fill");
    if (fill) {
      onBarDown(event);
      return;
    }
    var cell = event.target.closest && event.target.closest(".cell[data-date]");
    if (!cell) return;
    createDrag = { iso: cell.dataset.date, x: event.clientX, y: event.clientY, moved: false };
  });
  board.addEventListener("scroll", function () {
    if (board.dataset.ticking) return;
    board.dataset.ticking = "1";
    requestAnimationFrame(function () {
      board.dataset.ticking = "";
      updateViewYear();
    });
  });

  document.addEventListener("pointerdown", function (event) {
    if (actionEl.hidden) return;
    if (actionEl.contains(event.target)) return;
    if (event.target.closest && event.target.closest(".cell[data-date], .bar, #add, #today, #today-title")) return;
    selection = null;
    arm = null;
    hoverDate = null;
    paintSelection();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeEditor();
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
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Year Planner//EN", "CALSCALE:GREGORIAN"];
    list.forEach(function (plan) {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + plan.id + "@year-planner");
      lines.push("SUMMARY:" + escapeIcs(plan.title));
      lines.push("DTSTART;VALUE=DATE:" + plan.start.replace(/-/g, ""));
      lines.push("DTEND;VALUE=DATE:" + Planner.addDays(plan.end, 1).replace(/-/g, ""));
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
      var start = "";
      var end = "";
      var note = "";
      var uid = "";
      body.split(/\r?\n/).forEach(function (line) {
        var cut = line.indexOf(":");
        if (cut < 1) return;
        var key = line.slice(0, cut).split(";")[0].toUpperCase();
        var value = line.slice(cut + 1).trim();
        if (key === "SUMMARY") summary = unescapeIcs(value);
        if (key === "DESCRIPTION") note = unescapeIcs(value);
        if (key === "UID") uid = value;
        if (key === "DTSTART") start = value.replace(/[^0-9]/g, "").slice(0, 8);
        if (key === "DTEND") end = value.replace(/[^0-9]/g, "").slice(0, 8);
      });
      if (start.length !== 8) { skipped += 1; return; }
      var startIso = start.slice(0, 4) + "-" + start.slice(4, 6) + "-" + start.slice(6, 8);
      var endIso = startIso;
      if (end.length === 8) {
        endIso = Planner.addDays(end.slice(0, 4) + "-" + end.slice(4, 6) + "-" + end.slice(6, 8), -1);
        if (endIso < startIso) endIso = startIso;
      }
      var plan = Planner.normalize({
        id: uid ? uid.split("@")[0] : "",
        title: summary || "Plan",
        note: note,
        start: startIso,
        end: endIso
      });
      if (!plan) { skipped += 1; return; }
      if (!plan.id) plan.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + next.length;
      next.push(plan);
    });
    return { plans: next, skipped: skipped };
  }

  document.getElementById("export-ics").addEventListener("click", function () {
    download("year-planner.ics", plansToIcs(plans), "text/calendar");
    setStatus("Exported " + plans.length + " plans as a calendar.");
  });
  document.getElementById("import-ics").addEventListener("click", function () {
    document.getElementById("import-ics-file").click();
  });
  document.getElementById("import-ics-file").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    file.text().then(function (text) {
      var parsed = plansFromIcs(text);
      if (parsed.error) { setStatus(parsed.error); return; }
      if (!parsed.plans.length) { setStatus("No events found in that calendar."); return; }
      adoptPlans(parsed.plans, parsed.skipped, "events");
    });
  });

  var minuteTimer = 0;
  var midnightTimer = 0;

  function clearClock() {
    clearInterval(minuteTimer);
    clearTimeout(midnightTimer);
    minuteTimer = 0;
    midnightTimer = 0;
  }

  function armClock() {
    clearClock();
    if (document.hidden) return;
    minuteTimer = setInterval(function () {
      if (document.hidden) return;
      renderRhythm();
    }, 60000);
    var now = new Date();
    var nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    midnightTimer = setTimeout(function () {
      if (!document.hidden) render();
      armClock();
    }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 50));
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearClock();
      return;
    }
    render();
    armClock();
  });

  if (location.protocol === "http:" || location.protocol === "https:") {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  var booted = false;
  function boot() {
    render();
    if (booted) return;
    booted = true;
    var today = todayParts();
    var y = today.y;
    var m = today.m;
    if (y < RANGE_START) { y = RANGE_START; m = 1; }
    if (y > RANGE_END) { y = RANGE_END; m = 12; }
    scrollToMonth(y, m, false);
    updateViewYear();
    armClock();
  }
  hydrateImages().then(boot, boot);
  setTimeout(boot, 800);
})();
