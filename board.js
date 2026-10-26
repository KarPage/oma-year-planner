/* Year board: months, bars, and scrolling. */
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
  var trips = Planner.countTrips(list);
  var figures = [
    [String(list.length), "plans"],
    [String(trips), "trips"],
    [String(Planner.daysAway(list, year)), "days away"]
  ];
  renderTodayTile();
  renderRhythm();
  renderRangeNote();
  statsEl.replaceChildren();
  if (typeof paintGcal === "function") paintGcal();
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

function shortDate(iso) {
  var parts = Planner.parse(iso);
  if (!parts) return iso;
  return Planner.MONTHS[parts.m - 1].slice(0, 3) + " " + parts.d;
}

function renderDashExtra(list) {
  var host = document.getElementById("dash-extra");
  if (!host) return;
  host.className = "dash-group dash-up";
  host.replaceChildren();
  var label = document.createElement("span");
  label.className = "k";
  label.textContent = "Upcoming";
  host.append(label);
  var iso = todayIso();
  var next = list.filter(function (plan) { return plan.start >= iso; }).sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  }).slice(0, 3);
  if (!next.length) {
    var empty = document.createElement("span");
    empty.className = "dash-empty";
    empty.textContent = "Nothing coming up.";
    host.append(empty);
    return;
  }
  var ol = document.createElement("ol");
  next.forEach(function (plan) {
    var li = document.createElement("li");
    var button = document.createElement("button");
    button.type = "button";
    var when = document.createElement("span");
    when.className = "when";
    when.textContent = shortDate(plan.start);
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = plan.title;
    var days = document.createElement("span");
    days.className = "days";
    var away = Planner.diffDays(iso, plan.start);
    days.textContent = away + "d";
    button.append(when, name, days);
    button.addEventListener("click", function () { focusPlan(plan); });
    li.append(button);
    ol.append(li);
  });
  host.append(ol);
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
var rhythmUp = null;
var rhythmLast = null;

function focusPlan(plan) {
  var start = Planner.parse(plan.start);
  var end = Planner.parse(plan.end || plan.start);
  selectedId = plan.id;
  selection = { start: plan.start, end: plan.end };
  focusDate = plan.start;
  arm = null;
  hoverDate = null;
  noteDismissedFor = plan.id;
  noteShownFor = null;
  noteCard.hidden = true;
  noteCard.replaceChildren();
  render();
  syncTools();
  if (start && end && end.y >= RANGE_START && start.y <= RANGE_END) {
    var y = start.y;
    var m = start.m;
    if (y < RANGE_START) { y = RANGE_START; m = 1; }
    setStatus(plan.title + " · " + rangeLabel(plan));
    scrollToMonth(y, m, true);
    return;
  }
  setStatus(plan.title + " is outside " + RANGE_START + "–" + RANGE_END + " and stays in your plans.");
}

function dayPhrase(n, soon) {
  var phrase = Planner.plural(n, "day");
  return soon ? "in " + phrase : phrase + " ago";
}

function dashEvent(which, plan, days, soon) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "dash-event";
  button.dataset.which = which;
  var caption = document.createElement("span");
  caption.className = "k";
  caption.textContent = which === "up" ? "Up next" : (which === "last" ? "Last" : "Next");
  var row = document.createElement("span");
  row.className = "row";
  var name = document.createElement("span");
  name.className = "name";
  name.textContent = plan ? plan.title : "None";
  row.append(name);
  if (plan) {
    var num = document.createElement("b");
    num.className = "num";
    num.textContent = String(days);
    var unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = soon ? (days === 1 ? "day" : "days") : "days ago";
    row.append(num, unit);
    var lead = which === "up" ? "Up next: " : (which === "last" ? "Last: " : "Next: ");
    button.title = lead + plan.title + " " + dayPhrase(days, soon);
  } else {
    button.disabled = true;
  }
  button.append(caption, row);
  return button;
}

function renderRhythm() {
  var today = todayIso();
  var past = null;
  var futures = [];
  plans.forEach(function (plan) {
    if (plan.end < today && (!past || plan.end > past.end)) past = plan;
    if (plan.start > today) futures.push(plan);
  });
  futures.sort(function (a, b) {
    return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
  });
  var future = futures[0] || null;
  var up = futures[1] || null;
  rhythmNext = future;
  rhythmUp = up;
  rhythmLast = past;
  var host = document.getElementById("rhythm");
  if (!host) return;
  host.replaceChildren();
  function group(which, plan, soon) {
    var node = document.createElement("div");
    node.className = "dash-group" + (which === "up" ? " is-up" : "");
    var days = plan ? Planner.diffDays(soon ? today : plan.end, soon ? plan.start : today) : 0;
    node.append(dashEvent(which, plan, days, soon));
    return node;
  }
  host.append(
    group("next", future, true),
    group("up", up, true),
    group("last", past, false)
  );
}

function fitMarquee() {}

function renderRangeNote() {
  var note = document.getElementById("range-note");
  if (!note || !Planner.plansOutsideRange) return;
  var outside = Planner.plansOutsideRange(plans, RANGE_START, RANGE_END);
  if (!outside.length) {
    note.hidden = true;
    note.textContent = "";
    return;
  }
  var q = String(search.value || "").trim().toLowerCase();
  var matched = outside;
  if (q) {
    matched = outside.filter(function (plan) {
      var title = String(plan.title || "").toLowerCase();
      var label = String(plan.tag || "").toLowerCase();
      var text = String(plan.note || "").toLowerCase();
      return title.indexOf(q) !== -1 || label.indexOf(q) !== -1 || text.indexOf(q) !== -1;
    });
  }
  var span = RANGE_START + "–" + RANGE_END;
  note.hidden = false;
  if (q && matched.length) {
    var names = matched.slice(0, 3).map(function (plan) { return plan.title; }).join(", ");
    var extra = matched.length > 3 ? " +" + (matched.length - 3) : "";
    note.textContent = Planner.plural(matched.length, "match", "matches") + " outside " + span + ": " + names + extra;
    return;
  }
  note.textContent = Planner.plural(outside.length, "plan") + " outside " + span;
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
  var bar = document.createElement("div");
  bar.className = "dayhead-bar";
  var calendar = document.createElement("div");
  calendar.className = "calendar";
  calendar.setAttribute("role", "grid");
  calendar.setAttribute("aria-label", RANGE_START + " through " + RANGE_END);
  var today = todayIso();

  function head(className, text, column) {
    var el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    el.style.gridColumn = String(column);
    return el;
  }

  bar.append(head("corner", "Month", 1));
  for (var day = 1; day <= 31; day++) {
    var num = head("daynum", Planner.pad(day), day + 1);
    num.dataset.day = String(day);
    bar.append(num);
  }
  var away = document.createElement("button");
  away.type = "button";
  away.className = "away-head";
  away.textContent = "Away";
  away.title = "Days away from home this month";
  away.setAttribute("aria-label", "Days away from home this month");
  away.style.gridColumn = "33";
  bar.append(away);

  var row = 1;
  months.forEach(function (month, index) {
    if (month.m === 1 && index > 0) {
      var divider = document.createElement("div");
      divider.className = "year-divider";
      divider.style.gridRow = String(row);
      var ruleBefore = document.createElement("span");
      ruleBefore.className = "year-rule";
      ruleBefore.setAttribute("aria-hidden", "true");
      var mark = document.createElement("span");
      mark.className = "year-mark";
      mark.textContent = String(month.y);
      var ruleAfter = document.createElement("span");
      ruleAfter.className = "year-rule";
      ruleAfter.setAttribute("aria-hidden", "true");
      divider.append(ruleBefore, mark, ruleAfter);
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
        letter.dataset.short = letter.textContent.slice(0, 1);
        if (Planner.weekday(month.y, month.m, d) === 0) {
          cell.classList.add("weekend");
          letter.classList.add("sun");
        }
        if (iso < today) cell.classList.add("past");
        if (iso === today) {
          cell.classList.add("today");
          letter.classList.add("today");
          var headDay = bar.querySelector('.daynum[data-day="' + d + '"]');
          if (headDay) headDay.classList.add("today");
        }
        cell.append(letter);
      }
      calendar.append(cell);
    }
    var total = document.createElement("button");
    total.type = "button";
    total.className = "month-total zero";
    total.dataset.ym = key;
    total.style.gridColumn = "33";
    total.style.gridRow = String(row);
    total.textContent = "0";
    total.title = "Days away";
    calendar.append(total);
    row += 1;
  });

  board.replaceChildren(bar, calendar);
}

function googleMark() {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "g-mark");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", "M8 1.6a6.4 6.4 0 1 0 5.7 9.2H8.1V8.2h6.6A6.4 6.4 0 0 0 8 1.6z");
  svg.appendChild(path);
  return svg;
}

function syncBars() {
  var list = visible();
  var laid = Planner.layout(list, RANGE_START + "-01-01", RANGE_END + "-12-31");
  board.querySelectorAll(".bar, .single-more").forEach(function (bar) { bar.remove(); });
  var calendar = board.querySelector(".calendar");
  if (!calendar) return;
  var groups = Object.create(null);
  (laid.singles || []).forEach(function (seg) {
    var iso = cellDate(seg.y, seg.month, seg.startDay);
    if (!groups[iso]) groups[iso] = [];
    groups[iso].push(seg);
  });
  var tooled = {};
  var today = todayIso();
  laid.bars.forEach(function (bar) {
    var plan = bar.plan;
    var host = board.querySelector('.month[data-ym="' + bar.y + "-" + Planner.pad(bar.month) + '"]');
    if (!host) return;
    var el = document.createElement("button");
    el.type = "button";
    el.className = "bar";
    var past = plan.end < today;
    var span = bar.endDay - bar.startDay + 1;
    if (bar.continuesBefore) el.classList.add("cont-before");
    if (bar.continuesAfter) el.classList.add("cont-after");
    if (past) el.classList.add("is-past");
    if (span <= 2 && !bar.continuesBefore && !bar.continuesAfter) el.classList.add("is-brief");
    if (plan.id === selectedId) el.classList.add("selected");
    el.style.setProperty("--cat", plan.color || "#74a869");
    var ym = bar.y + "-" + Planner.pad(bar.month);
    el.style.gridColumn = (bar.startDay + 1) + " / " + (bar.endDay + 2);
    el.style.gridRow = host.dataset.row;
    el.style.setProperty("--lane", String(bar.lane));
    el.style.setProperty("--lanes", String(laid.lanes[ym] || 1));
    el.dataset.id = plan.id;
    var progress = Planner.checklistProgress(plan);
    var tip = plan.title + " · " + bar.days + "d" + (progress ? " · " + progress.done + "/" + progress.total : "");
    el.title = tip;
    el.setAttribute("aria-label", tip);

    var fill = document.createElement("span");
    fill.className = "fill";
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
    var pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = bar.days + "d";
    count.append(pill);
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
    if (plan.source !== "gcal" && atStart) fill.append(handle("w"));
    if (plan.source !== "gcal" && atEnd) fill.append(handle("e"));
    if (plan.source !== "gcal" && !tooled[plan.id]) {
      tooled[plan.id] = true;
      fill.append(planTools(plan));
    }
    if (plan.source === "gcal") {
      el.classList.add("is-gcal");
      fill.insertBefore(googleMark(), fill.firstChild);
    }
    el.append(fill);
    calendar.append(el);
  });
  fitBarLabels();
  requestAnimationFrame(fitBarLabels);
  Object.keys(groups).forEach(function (iso) {
    var segs = groups[iso];
    var host = board.querySelector('.month[data-ym="' + iso.slice(0, 7) + '"]');
    if (!host || !segs.length) return;
    if (segs.length >= 3) {
      var more = document.createElement("button");
      more.type = "button";
      more.className = "single-more";
      more.dataset.date = iso;
      more.style.gridColumn = String(segs[0].startDay + 1);
      more.style.gridRow = host.dataset.row;
      more.textContent = String(segs.length);
      more.setAttribute("aria-label", Planner.plural(segs.length, "plan"));
      calendar.append(more);
      return;
    }
    var mini = segs.length === 2;
    for (var i = 0; i < segs.length; i++) {
      var plan = segs[i].plan;
      var tick = document.createElement("button");
      tick.type = "button";
      tick.className = "bar single";
      if (mini) tick.classList.add("is-mini");
      if (plan.end < today) tick.classList.add("is-past");
      if (iso === today) tick.classList.add("is-today");
      if (plan.id === selectedId) tick.classList.add("selected");
      tick.style.setProperty("--cat", plan.color || "#74a869");
      tick.style.setProperty("--slot", String(i));
      tick.style.gridColumn = String(segs[i].startDay + 1);
      tick.style.gridRow = host.dataset.row;
      tick.dataset.id = plan.id;
      tick.dataset.date = iso;
      var oneTip = dotTip(plan);
      tick.setAttribute("aria-label", oneTip);
      var mark = document.createElement("span");
      mark.className = "fill single";
      tick.append(mark);
      if (!mini) {
        var cap = document.createElement("span");
        cap.className = "mark-label";
        cap.textContent = dotCaption(plan);
        tick.append(cap);
      }
      if (plan.source === "gcal") tick.classList.add("is-gcal");
      calendar.append(tick);
    }
  });
}

function dotCaption(plan) {
  var clock = String(plan && plan.time || "");
  var match = clock.match(/^0?(\d{1,2}:\d{2})$/);
  if (match) return match[1];
  var word = String(plan && plan.title || "").trim().split(/\s+/)[0] || "";
  return word.slice(0, 7);
}

function dotTip(plan) {
  var bits = [plan.title];
  if (plan.time) bits.push(plan.time);
  if (plan.location) bits.push(plan.location);
  return bits.join(" · ");
}

function syncTotals() {
  var list = visible();
  board.querySelectorAll(".month-total").forEach(function (node) {
    var parts = node.dataset.ym.split("-");
    var count = Planner.monthDaysAway(list, +parts[0], +parts[1]);
    node.textContent = String(count);
    node.classList.toggle("zero", count === 0);
    var awayLabel = Planner.plural(count, "day") + " away from home";
    node.title = awayLabel;
    node.setAttribute("aria-label", awayLabel);
  });
}

/* Drop "·Nd" before the name truncates. Full title and days stay on the bar tooltip. */
function fitBarLabels() {
  board.querySelectorAll(".bar:not(.single):not(.is-brief) .fill").forEach(function (fill) {
    var label = fill.querySelector(".label");
    var count = fill.querySelector(".count");
    if (!label || !count) return;
    count.classList.remove("is-dropped");
    if (!Planner.barKeepsDayCount(label.scrollWidth, label.clientWidth)) count.classList.add("is-dropped");
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

function headHeight() {
  var head = board.querySelector(".dayhead-bar");
  var measured = head ? head.getBoundingClientRect().height : 0;
  if (!(measured > 0)) {
    var raw = parseFloat(getComputedStyle(board).getPropertyValue("--head"));
    measured = raw > 0 ? raw : 26;
  }
  return Math.ceil(measured);
}

function applySnapPadding() {
  board.style.scrollPaddingTop = headHeight() + "px";
}

var scrollGen = 0;

function scrollToMonth(y, m, smooth) {
  board.classList.remove("today-view");
  var label = board.querySelector('.month[data-ym="' + y + "-" + Planner.pad(m) + '"]');
  if (!label) return;
  /* Ceil so a fractional row cannot leave the previous month above the header. */
  var rawTop = label.getBoundingClientRect().top - board.getBoundingClientRect().top + board.scrollTop - headHeight();
  var top = Math.max(0, Math.ceil(rawTop - 0.01));
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var gen = ++scrollGen;
  if (!(smooth && !reduce) || Math.abs(board.scrollTop - top) < 2) {
    board.scrollTo({ top: top, behavior: "instant" });
    if (!boardDrag) board.classList.remove("panning");
    return;
  }
  /* Snap is off while the board glides, otherwise a mandatory snap
     stops a Page Down or Home on the next month. */
  board.classList.add("panning");
  board.scrollTo({ top: top, behavior: "smooth" });
  function done() {
    board.removeEventListener("scrollend", done);
    if (gen !== scrollGen || boardDrag) return;
    board.classList.remove("panning");
  }
  board.addEventListener("scrollend", done);
  setTimeout(done, 900);
}

function centerOnToday(smooth) {
  var today = todayParts();
  var month = board.querySelector('.month[data-ym="' + today.y + "-" + Planner.pad(today.m) + '"]');
  if (!month) return;
  board.classList.add("today-view");
  year = today.y;
  if (yearLabel) yearLabel.textContent = String(today.y);
  var boardRect = board.getBoundingClientRect();
  var monthRect = month.getBoundingClientRect();
  var head = headHeight();
  var midY = boardRect.top + head + Math.max(0, boardRect.height - head) / 2;
  var top = board.scrollTop + (monthRect.top + monthRect.height / 2 - midY);
  var maxTop = Math.max(0, board.scrollHeight - board.clientHeight);
  if (top < 0) top = 0;
  if (top > maxTop) top = maxTop;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  board.scrollTo({
    top: top,
    behavior: smooth && !reduce ? "smooth" : "instant"
  });
}

function monthAtTopIndex() {
  var months = board.querySelectorAll(".month");
  var edge = board.getBoundingClientRect().top + headHeight() + 2;
  for (var i = 0; i < months.length; i++) {
    if (months[i].getBoundingClientRect().bottom > edge) return i;
  }
  return Math.max(0, months.length - 1);
}

function scrollByMonths(delta) {
  var months = board.querySelectorAll(".month");
  if (!months.length) return;
  var index = monthAtTopIndex() + delta;
  if (index < 0) index = 0;
  if (index > months.length - 1) index = months.length - 1;
  var parts = months[index].dataset.ym.split("-");
  scrollToMonth(+parts[0], +parts[1], true);
}

var snapTimer = 0;

function nearestMonth() {
  var months = board.querySelectorAll(".month");
  var edge = board.getBoundingClientRect().top + headHeight();
  var best = null;
  var bestDist = Infinity;
  for (var i = 0; i < months.length; i++) {
    var dist = months[i].getBoundingClientRect().top - edge;
    if (Math.abs(dist) < Math.abs(bestDist)) {
      bestDist = dist;
      best = months[i];
    }
  }
  return best;
}

function finishSnap() {
  var target = nearestMonth();
  if (!target) {
    if (!boardDrag) board.classList.remove("panning");
    return;
  }
  var parts = target.dataset.ym.split("-");
  scrollToMonth(+parts[0], +parts[1], true);
}

function flingBoard(velocity) {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || Math.abs(velocity) < 0.05) {
    finishSnap();
    return;
  }
  var v = Math.max(-2.4, Math.min(2.4, velocity));
  var last = performance.now();
  function frame(now) {
    if (boardDrag) return;
    var dt = Math.min(34, now - last);
    last = now;
    board.scrollTop += v * dt;
    v *= Math.pow(0.93, dt / 16);
    if (Math.abs(v) > 0.04) flingId = requestAnimationFrame(frame);
    else finishSnap();
  }
  flingId = requestAnimationFrame(frame);
}

function startBoardDrag(event) {
  if (flingId) cancelAnimationFrame(flingId);
  flingId = 0;
  if (snapTimer) clearTimeout(snapTimer);
  boardDrag = {
    pointerId: event.pointerId,
    y: event.clientY,
    lastY: event.clientY,
    lastT: performance.now(),
    originScroll: board.scrollTop,
    velocity: 0,
    moved: false
  };
  board.classList.add("panning");
  try { board.setPointerCapture(event.pointerId); } catch (err) { /* pointer already gone */ }
  event.preventDefault();
}

function moveBoardDrag(event) {
  var drag = boardDrag;
  if (!drag) return;
  var now = performance.now();
  var dy = event.clientY - drag.y;
  if (Math.abs(dy) > 3) drag.moved = true;
  board.scrollTop = drag.originScroll - dy;
  var dt = Math.max(1, now - drag.lastT);
  var instant = (drag.lastY - event.clientY) / dt;
  drag.velocity = drag.velocity * 0.65 + instant * 0.35;
  drag.lastY = event.clientY;
  drag.lastT = now;
}

function endBoardDrag() {
  var drag = boardDrag;
  boardDrag = null;
  if (!drag) return;
  try {
    if (board.hasPointerCapture(drag.pointerId)) board.releasePointerCapture(drag.pointerId);
  } catch (err) { /* already released */ }
  if (!drag.moved) {
    board.classList.remove("panning");
    return;
  }
  flingBoard(drag.velocity);
}

function updateViewYear() {
  var months = board.querySelectorAll(".month");
  var rect = board.getBoundingClientRect();
  var head = headHeight();
  var edge = board.classList.contains("today-view")
    ? rect.top + head + Math.max(0, rect.height - head) / 2
    : rect.top + head + 4;
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

function hideFloater() {
  if (rangeFloater) rangeFloater.hidden = true;
}
