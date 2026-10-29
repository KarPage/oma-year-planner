/* Year-planner date math. Dates are YYYY-MM-DD calendar days, never timestamps. */
var Planner = (function () {
  var LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var SAMPLE = [
    { id: "ski-week", title: "Ski week", tag: "Trip", color: "#74a869", start: "2026-01-05", end: "2026-01-11" },
    { id: "city-break", title: "City break", tag: "Trip", color: "#74a869", start: "2026-03-12", end: "2026-03-16" },
    { id: "wedding-weekend", title: "Wedding weekend", tag: "Trip", color: "#c0d1a4", start: "2026-04-24", end: "2026-04-27" },
    { id: "workshop-may", title: "Workshop", tag: "Trip", color: "#37a388", start: "2026-05-11", end: "2026-05-14" },
    { id: "workshop-jun", title: "Workshop", tag: "Trip", color: "#37a388", start: "2026-06-08", end: "2026-06-11" },
    { id: "coast-week", title: "Coast week", tag: "Trip", color: "#74a869", start: "2026-07-06", end: "2026-07-18" },
    { id: "lake-week", title: "Lake week", tag: "Trip", color: "#54bda1", start: "2026-08-10", end: "2026-08-16" },
    { id: "autumn-hike", title: "Autumn hike", tag: "Trip", color: "#c0d1a4", start: "2026-09-18", end: "2026-09-21" },
    { id: "workshop-oct", title: "Workshop", tag: "Trip", color: "#37a388", start: "2026-10-05", end: "2026-10-08" },
    { id: "year-end", title: "Year-end break", tag: "Trip", color: "#74a869", start: "2026-12-28", end: "2027-01-03" }
  ];

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parse(iso) {
    var text = String(iso == null ? "" : iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    var y = +text.slice(0, 4);
    var m = +text.slice(5, 7);
    var d = +text.slice(8, 10);
    var ms = Date.UTC(y, m - 1, d);
    if (isNaN(ms)) return null;
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null;
    return { y: y, m: m, d: d };
  }

  function utc(iso) {
    var p = parse(iso);
    if (!p) return NaN;
    return Date.UTC(p.y, p.m - 1, p.d);
  }

  function isoFromUTC(ms) {
    var dt = new Date(ms);
    return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
  }

  function addDays(iso, days) {
    var ms = utc(iso);
    if (isNaN(ms)) return iso;
    return isoFromUTC(ms + days * 86400000);
  }

  function diffDays(from, to) {
    var a = utc(from);
    var b = utc(to);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  function inclusiveDays(from, to) {
    if (!parse(from) || !parse(to)) return 0;
    var start = from <= to ? from : to;
    var end = from <= to ? to : from;
    return diffDays(start, end) + 1;
  }

  function prettyDate(iso) {
    var p = parse(iso);
    if (!p) return String(iso || "");
    return MONTHS[p.m - 1] + " " + p.d;
  }

  /* "1 plan", "0 plans", "2 matches". Zero and anything but 1 use the plural. */
  function plural(n, singular, pluralForm) {
    var word = n === 1 ? singular : (pluralForm || singular + "s");
    return n + " " + word;
  }

  function rangeCountLabel(from, to) {
    if (!parse(from) || !parse(to)) return "";
    var start = from <= to ? from : to;
    var end = from <= to ? to : from;
    var days = inclusiveDays(start, end);
    var when = start === end ? prettyDate(start) : prettyDate(start) + " – " + prettyDate(end);
    return when + " · " + plural(days, "day");
  }

  /* Keep the day count only while the name is not already truncated.
     A zero client width means layout has not run yet. */
  function barKeepsDayCount(nameScroll, nameClient) {
    if (!(nameClient > 0)) return true;
    return nameScroll <= nameClient + 1;
  }

  function hexRgb(hex) {
    if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  function mixRgb(a, b, t) {
    return [
      a[0] * t + b[0] * (1 - t),
      a[1] * t + b[1] * (1 - t),
      a[2] * t + b[2] * (1 - t)
    ];
  }

  function channelLum(c) {
    var x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }

  function relLum(rgb) {
    return 0.2126 * channelLum(rgb[0]) + 0.7152 * channelLum(rgb[1]) + 0.0722 * channelLum(rgb[2]);
  }

  function contrast(a, b) {
    var hi = Math.max(relLum(a), relLum(b));
    var lo = Math.min(relLum(a), relLum(b));
    return (hi + 0.05) / (lo + 0.05);
  }

  /* "fg" is the light theme text and "bg" is the dark ground.
     A current bar is 76% of the plan color over the cell. A past bar
     pulls that color toward muted, then toward the background.
     The result is whichever ink clears WCAG AA on the fill. */
  function barInk(catHex, fgHex, bgHex, extras) {
    var cat = hexRgb(catHex);
    var fg = hexRgb(fgHex);
    var bg = hexRgb(bgHex);
    if (!cat || !fg || !bg) return "fg";
    extras = extras || {};
    var fgMin = Infinity;
    var bgMin = Infinity;
    var muted = hexRgb(extras.muted) || [84, 87, 84];
    if (extras.past) {
      var pastFill = mixRgb(mixRgb(cat, muted, 0.58), bg, 0.72);
      fgMin = contrast(pastFill, fg);
      bgMin = contrast(pastFill, bg);
    } else {
      var backs = [bg];
      var raised = hexRgb(extras.raised);
      if (raised) backs.push(mixRgb(raised, bg, 0.35));
      var sun = hexRgb(extras.sun);
      if (sun && raised) backs.push(mixRgb(sun, backs[backs.length - 1], 0.04));
      backs.forEach(function (back) {
        var fill = mixRgb(cat, back, 0.76);
        fgMin = Math.min(fgMin, contrast(fill, fg));
        bgMin = Math.min(bgMin, contrast(fill, bg));
      });
    }
    if (bgMin >= 4.5 && bgMin >= fgMin) return "bg";
    if (fgMin >= 4.5) return "fg";
    return bgMin > fgMin ? "bg" : "fg";
  }

  function importStatus(mode, added, importedCount, identical, skipped, singular) {
    var one = singular || "plan";
    var parts = [];
    if (mode === "merge") {
      parts.push("Merged " + plural(added, one));
      if (identical) parts.push("skipped " + plural(identical, "identical " + one));
    } else {
      parts.push("Imported " + plural(importedCount, one));
    }
    if (skipped) parts.push("skipped " + plural(skipped, "unreadable " + one));
    return parts.join(", ") + ".";
  }

  /* Previous year through two years ahead. While that window still touches
     2025–2028, keep those years on the board so the range rolls forward
     without dropping the years this release promised. */
  var BROWSE_ANCHOR_START = 2025;
  var BROWSE_ANCHOR_END = 2028;
  var DRAG_THRESHOLD = 6;

  function browseSpan(year) {
    var y = year | 0;
    if (!y) y = new Date().getFullYear();
    var rollStart = y - 1;
    var rollEnd = y + 2;
    var start = rollStart;
    var end = rollEnd;
    var touches = rollEnd >= BROWSE_ANCHOR_START && rollStart <= BROWSE_ANCHOR_END;
    var before = rollEnd < BROWSE_ANCHOR_START;
    if (touches || before) {
      start = Math.min(rollStart, BROWSE_ANCHOR_START);
      end = Math.max(rollEnd, BROWSE_ANCHOR_END);
    }
    return { start: start, end: end };
  }

  function yearNavEnds(viewYear, rangeStart, rangeEnd) {
    return {
      prev: !(viewYear > rangeStart),
      next: !(viewYear < rangeEnd)
    };
  }

  function rollingRange(today, plans) {
    var y = today && typeof today === "object" ? today.y : (parse(today) || {}).y;
    if (!y) y = new Date().getFullYear();
    var span = browseSpan(y);
    var start = span.start;
    var end = span.end;
    /* At most two years before the current year and three years after it.
       A typo year must not stretch the board. */
    var minY = y - 2;
    var maxY = y + 3;
    (plans || []).forEach(function (plan) {
      if (!plan) return;
      var a = parse(plan.start);
      var b = parse(plan.end || plan.start);
      if (!a && !b) return;
      var lo = a && b ? Math.min(a.y, b.y) : (a || b).y;
      var hi = a && b ? Math.max(a.y, b.y) : (a || b).y;
      var from = Math.max(lo, minY);
      var to = Math.min(hi, maxY);
      if (from > to) return;
      if (from < start) start = from;
      if (to > end) end = to;
    });
    return { start: start, end: end };
  }

  function plansOutsideRange(plans, startYear, endYear) {
    var from = startYear + "-01-01";
    var to = endYear + "-12-31";
    var out = [];
    (plans || []).forEach(function (plan) {
      if (!plan || !plan.start) return;
      if (!overlapsRange(plan, from, to)) out.push(plan);
    });
    return out;
  }

  function planCategory(plan) {
    return String((plan && (plan.tag || plan.category)) || "").trim();
  }

  function samePlanContent(a, b) {
    if (!a || !b) return false;
    var aEnd = a.end || a.start;
    var bEnd = b.end || b.start;
    return String(a.title || "").trim() === String(b.title || "").trim()
      && String(a.start || "") === String(b.start || "")
      && String(aEnd || "") === String(bEnd || "")
      && planCategory(a) === planCategory(b)
      && String(a.note || "").trim() === String(b.note || "").trim()
      && String(a.color || "").trim().toLowerCase() === String(b.color || "").trim().toLowerCase();
  }

  function copyPlan(plan, id) {
    return {
      id: id || "",
      title: plan.title,
      tag: plan.tag,
      color: plan.color,
      note: plan.note || "",
      images: plan.images ? plan.images.slice() : [],
      start: plan.start,
      end: plan.end
    };
  }

  function mergePlans(current, incoming, nextId) {
    var byId = Object.create(null);
    var order = [];
    function put(plan) {
      byId[plan.id] = plan;
      order.push(plan.id);
    }
    (current || []).forEach(function (plan) {
      if (!plan || !plan.id || byId[plan.id]) return;
      put(copyPlan(plan, plan.id));
    });
    (incoming || []).forEach(function (plan, index) {
      if (!plan) return;
      var copy = copyPlan(plan, plan.id);
      var existing = copy.id ? byId[copy.id] : null;
      if (existing && samePlanContent(existing, plan)) return;
      if (!copy.id || existing) {
        var id = nextId ? nextId(copy, index) : "";
        if (!id || byId[id]) id = "import-" + order.length;
        while (byId[id]) id += "x";
        copy.id = id;
      }
      put(copy);
    });
    return order.map(function (id) { return byId[id]; });
  }

  function isSingleDay(plan) {
    if (!plan || !plan.start) return false;
    var end = plan.end < plan.start ? plan.start : plan.end;
    return plan.start === end;
  }

  var PLAN_TYPES = { Trip: true, Event: true, Reminder: true };

  /* Missing type: multi-day is a trip, one day is an event. */
  function planType(plan) {
    if (plan && PLAN_TYPES[plan.type]) return plan.type;
    return isSingleDay(plan) ? "Event" : "Trip";
  }

  function isTrip(plan) {
    return planType(plan) === "Trip";
  }

  function countTrips(plans) {
    var n = 0;
    (plans || []).forEach(function (plan) { if (isTrip(plan)) n += 1; });
    return n;
  }

  function checklistProgress(plan) {
    var list = plan && Array.isArray(plan.checklist) ? plan.checklist : [];
    if (!list.length) return null;
    var done = 0;
    list.forEach(function (item) { if (item && item.done) done += 1; });
    return { done: done, total: list.length };
  }

  /* Old bottom-pill stack height. The board draws dots and does not inset bars by this. */
  function singleMarkerReserve(count) {
    var shown = Math.min(Math.max(0, count | 0), 3);
    if (!shown) return 0;
    return 3 + shown * 7 + (shown - 1) * 2 + 3;
  }

  function edgeInsets(margin) {
    if (margin && typeof margin === "object") {
      return {
        top: margin.top == null ? 8 : margin.top,
        right: margin.right == null ? 8 : margin.right,
        bottom: margin.bottom == null ? 8 : margin.bottom,
        left: margin.left == null ? 8 : margin.left
      };
    }
    var edge = margin == null ? 8 : margin;
    return { top: edge, right: edge, bottom: edge, left: edge };
  }

  /* Keep a popover fully inside the viewport. Prefer below the anchor,
     flip above when that would clip, then shift left or right.
     margin may be a number or { top, right, bottom, left }. arrow is the
     anchor center measured from the popover's left edge. */
  function placeNear(anchor, size, view, gap, margin) {
    var g = gap == null ? 6 : gap;
    var edge = edgeInsets(margin);
    var width = size.width;
    var height = size.height;
    var left = anchor.left;
    var top = anchor.bottom + g;
    var flipped = false;
    if (top + height > view.height - edge.bottom) {
      var above = anchor.top - height - g;
      if (above >= edge.top) {
        top = above;
        flipped = true;
      } else {
        top = view.height - edge.bottom - height;
      }
    }
    if (top < edge.top) top = edge.top;
    if (top + height > view.height - edge.bottom) top = Math.max(edge.top, view.height - edge.bottom - height);
    if (left + width > view.width - edge.right) left = view.width - edge.right - width;
    if (left < edge.left) left = edge.left;
    var mid = anchor.left;
    if (anchor.right != null) mid = (anchor.left + anchor.right) / 2;
    else if (anchor.width != null) mid = anchor.left + anchor.width / 2;
    return { left: left, top: top, flipped: flipped, arrow: mid - left };
  }

  /* A drag starts only after the pointer has moved at least `threshold` px. */
  function dragPastThreshold(dx, dy, threshold) {
    var limit = threshold == null ? DRAG_THRESHOLD : threshold;
    if (!(limit >= 0)) limit = DRAG_THRESHOLD;
    return (dx * dx + dy * dy) >= (limit * limit);
  }

  /* Click never moves a plan. Resize only from its own end handles. */
  function planGesture(where, pastThreshold) {
    if (!pastThreshold) return "none";
    if (where === "start" || where === "end") return "resize";
    if (where === "body") return "move";
    return "none";
  }

  /* A body drag commits only after the pointer travels a full day cell,
     across or down into the next row. A small slip stays a click. */
  function moveCommit(dx, dy, cellWidth, cellHeight) {
    if (!dragPastThreshold(dx, dy)) return false;
    var across = cellWidth > 0 ? cellWidth : 32;
    var down = cellHeight > 0 ? cellHeight : 48;
    return Math.abs(dx) >= across || Math.abs(dy) >= down;
  }

  /* One or two single-day plans show as chips. A third becomes one chip
     plus a +N counter, so a day never stacks more than two rows. */
  function dayChipStack(count) {
    var n = count | 0;
    if (n <= 0) return { visible: 0, more: 0, rows: 0 };
    if (n === 1) return { visible: 1, more: 0, rows: 1 };
    if (n === 2) return { visible: 2, more: 0, rows: 2 };
    return { visible: 1, more: n - 1, rows: 2 };
  }

  var CHIP_LABEL_MIN = 36;

  function chipUsesInitial(cellWidth) {
    return !(cellWidth >= CHIP_LABEL_MIN);
  }

  function chipInitial(title) {
    var text = String(title || "").trim();
    if (!text) return "";
    return text.charAt(0).toUpperCase();
  }

  /* The header pin button asks first. Skip stores a local choice.
     Already pinned asks to unpin, unless that choice says to act directly. */
  function pinButtonAction(skipped, pinned) {
    if (skipped) return pinned ? "unpin" : "pin";
    return pinned ? "ask-unpin" : "ask-pin";
  }

  /* The clicked day stays the anchor. The other end follows the pointer. */
  function selectionSpan(anchor, end) {
    if (!anchor || !parse(anchor)) return null;
    if (!end || !parse(end)) end = anchor;
    if (anchor <= end) return { start: anchor, end: end, anchor: anchor, edge: "end" };
    return { start: end, end: anchor, anchor: anchor, edge: "start" };
  }

  function extendSelection(selection, iso) {
    if (!iso || !parse(iso)) return selection || null;
    var anchor = selection && (selection.anchor || selection.start);
    if (!anchor || !parse(anchor)) return selectionSpan(iso, iso);
    return selectionSpan(anchor, iso);
  }

  function nudgeSelection(selection, deltaDays) {
    if (!selection || !selection.start) return selection || null;
    var anchor = selection.anchor || selection.start;
    var moving = selection.edge === "start" ? selection.start : selection.end;
    var next = addDays(moving, deltaDays | 0);
    if (!next) return selection;
    return selectionSpan(anchor, next);
  }

  /* Same away cell toggles closed. A different cell switches. */
  function awayToggle(openKey, key) {
    if (!key) return "";
    return openKey === key ? "" : String(key);
  }

  /* A wrapping plan is one bar per month. Fade about two day cells at each
     cut. The name stays on the longest piece, and also on a piece at least
     two thirds as long, but never inside the fade. */
  function wrapLabels(segments) {
    var list = Array.isArray(segments) ? segments : [];
    var max = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      var span = list[i] && list[i].span | 0;
      if (span > max) max = span;
    }
    var out = [];
    for (i = 0; i < list.length; i++) {
      var seg = list[i] || {};
      var n = seg.span | 0;
      if (n < 1) {
        out.push({ show: false, fade: 0, lead: 0, tail: 0 });
        continue;
      }
      var fade = n < 2 ? n : 2;
      var lead = seg.continuesBefore ? fade : 0;
      var tail = seg.continuesAfter ? fade : 0;
      if (lead + tail > n) {
        lead = seg.continuesBefore ? Math.ceil(n / 2) : 0;
        tail = n - lead;
      }
      var room = n - lead - tail;
      var similar = max > 0 && n * 3 >= max * 2;
      out.push({
        show: !!(similar && room >= 1),
        fade: fade,
        lead: lead,
        tail: tail
      });
    }
    return out;
  }

  /* Widest free run of days inside a bar. Ties go to the run nearest the
     center, then the earlier run. `from` is 1-based within the bar. */
  function labelSlot(startDay, endDay, blockedDays) {
    var start = startDay | 0;
    var end = endDay | 0;
    var span = end - start + 1;
    if (span < 1) return { from: 1, to: 1, span: 1 };
    var blocked = Object.create(null);
    (blockedDays || []).forEach(function (day) {
      var n = day | 0;
      if (n >= start && n <= end) blocked[n] = true;
    });
    var best = null;
    var runFrom = null;
    function consider(from, to) {
      if (from == null || to < from) return;
      var len = to - from + 1;
      var center = (start + end) / 2;
      var dist = Math.abs((from + to) / 2 - center);
      var better = !best || len > best.len
        || (len === best.len && dist < best.dist - 1e-9)
        || (len === best.len && Math.abs(dist - best.dist) < 1e-9 && from < best.from);
      if (better) best = { from: from, to: to, len: len, dist: dist };
    }
    for (var day = start; day <= end; day++) {
      if (blocked[day]) {
        consider(runFrom, day - 1);
        runFrom = null;
      } else if (runFrom == null) {
        runFrom = day;
      }
    }
    consider(runFrom, end);
    if (!best) return { from: 1, to: span, span: span };
    return { from: best.from - start + 1, to: best.to - start + 1, span: best.len };
  }

  function planSpanPhrase(start, end) {
    function one(iso) {
      var p = parse(iso);
      if (!p) return String(iso || "");
      return LETTERS[weekday(p.y, p.m, p.d)] + " " + MONTHS[p.m - 1] + " " + p.d;
    }
    if (!start) return "";
    var a = end && end < start ? end : start;
    var b = end && end < start ? start : (end || start);
    if (a === b) return one(a);
    return one(a) + " – " + one(b);
  }

  function planLengthPhrase(start, end) {
    return plural(inclusiveDays(start, end), "day");
  }

  function planTimingPhrase(start, end, today) {
    if (!start || !end || !today || !parse(start) || !parse(end) || !parse(today)) return "";
    var a = start <= end ? start : end;
    var b = start <= end ? end : start;
    if (today < a) return plural(diffDays(today, a), "day") + " until it starts";
    if (today > b) return "ended " + plural(diffDays(b, today), "day") + " ago";
    return "in progress, " + plural(diffDays(today, b) + 1, "day") + " left";
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function weekday(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function weekdayLetter(y, m, d) {
    return LETTERS[weekday(y, m, d)];
  }

  function ymd(y, m, d) {
    return y + "-" + pad(m) + "-" + pad(d);
  }

  /* Anonymous Gregorian computus. Month is 3 or 4. */
  function easterSunday(year) {
    var y = year | 0;
    var a = y % 19;
    var b = Math.floor(y / 100);
    var c = y % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return ymd(y, month, day);
  }

  function nthWeekday(year, month, dow, n) {
    var first = weekday(year, month, 1);
    var day = 1 + (dow - first + 7) % 7 + (n - 1) * 7;
    if (day < 1 || day > daysInMonth(year, month)) return "";
    return ymd(year, month, day);
  }

  function lastWeekday(year, month, dow) {
    var dim = daysInMonth(year, month);
    var last = weekday(year, month, dim);
    return ymd(year, month, dim - (last - dow + 7) % 7);
  }

  /* Saturday is observed Friday. Sunday is observed Monday. Weekdays stay put. */
  function observedDate(iso) {
    var parts = parse(iso);
    if (!parts) return "";
    var dow = weekday(parts.y, parts.m, parts.d);
    if (dow === 6) return addDays(iso, -1);
    if (dow === 0) return addDays(iso, 1);
    return iso;
  }

  function pushHoliday(list, year, iso, name, kind) {
    var parts = parse(iso);
    if (!parts || parts.y !== year || !name) return;
    var key = iso + "\n" + name;
    if (list._seen[key]) return;
    list._seen[key] = true;
    list.push({ date: iso, name: name, kind: kind });
  }

  function addFederal(list, year, iso, name) {
    pushHoliday(list, year, iso, name, "federal");
    var observed = observedDate(iso);
    if (observed && observed !== iso) pushHoliday(list, year, observed, name + " (observed)", "observed");
  }

  /* US federal holidays plus the common observances. No network. */
  function holidaysForYear(year) {
    var y = year | 0;
    if (!(y >= 1 && y <= 9999)) return [];
    var list = [];
    list._seen = Object.create(null);
    addFederal(list, y, ymd(y, 1, 1), "New Year's Day");
    addFederal(list, y, ymd(y + 1, 1, 1), "New Year's Day");
    pushHoliday(list, y, nthWeekday(y, 1, 1, 3), "MLK Day", "federal");
    pushHoliday(list, y, nthWeekday(y, 2, 1, 3), "Presidents' Day", "federal");
    pushHoliday(list, y, lastWeekday(y, 5, 1), "Memorial Day", "federal");
    addFederal(list, y, ymd(y, 6, 19), "Juneteenth");
    addFederal(list, y, ymd(y, 7, 4), "Independence Day");
    pushHoliday(list, y, nthWeekday(y, 9, 1, 1), "Labor Day", "federal");
    pushHoliday(list, y, nthWeekday(y, 10, 1, 2), "Columbus / Indigenous Peoples' Day", "federal");
    addFederal(list, y, ymd(y, 11, 11), "Veterans Day");
    pushHoliday(list, y, nthWeekday(y, 11, 4, 4), "Thanksgiving", "federal");
    addFederal(list, y, ymd(y, 12, 25), "Christmas");
    pushHoliday(list, y, ymd(y, 2, 14), "Valentine's Day", "observance");
    pushHoliday(list, y, easterSunday(y), "Easter", "observance");
    pushHoliday(list, y, nthWeekday(y, 5, 0, 2), "Mother's Day", "observance");
    pushHoliday(list, y, nthWeekday(y, 6, 0, 3), "Father's Day", "observance");
    pushHoliday(list, y, ymd(y, 10, 31), "Halloween", "observance");
    pushHoliday(list, y, ymd(y, 12, 31), "New Year's Eve", "observance");
    delete list._seen;
    list.sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    return list;
  }

  function overlapsRange(plan, fromIso, toIso) {
    var start = plan.start;
    var end = plan.end < plan.start ? plan.start : plan.end;
    var from = fromIso <= toIso ? fromIso : toIso;
    var to = fromIso <= toIso ? toIso : fromIso;
    return start <= to && end >= from;
  }

  function overlapsYear(plan, year) {
    return overlapsRange(plan, year + "-01-01", year + "-12-31");
  }

  function monthsInDateRange(fromIso, toIso) {
    var from = fromIso <= toIso ? fromIso : toIso;
    var to = fromIso <= toIso ? toIso : fromIso;
    var a = parse(from);
    var b = parse(to);
    if (!a || !b) return [];
    var out = [];
    var y = a.y;
    var m = a.m;
    var guard = 0;
    while ((y < b.y || (y === b.y && m <= b.m)) && guard < 240) {
      out.push({ y: y, m: m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      guard += 1;
    }
    return out;
  }

  function eachDay(plan, year, visit) {
    var start = utc(plan.start);
    var end = utc(plan.end);
    if (isNaN(start) || isNaN(end)) return;
    if (end < start) end = start;
    var yearStart = Date.UTC(year, 0, 1);
    var yearEnd = Date.UTC(year, 11, 31);
    var cursor = Math.max(start, yearStart);
    var last = Math.min(end, yearEnd);
    while (cursor <= last) {
      visit(cursor);
      cursor += 86400000;
    }
  }

  function daysAway(plans, year) {
    var seen = Object.create(null);
    (plans || []).forEach(function (plan) {
      if (!isTrip(plan)) return;
      eachDay(plan, year, function (ms) {
        seen[ms] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function monthsInRange(startYear, endYear) {
    var out = [];
    var from = startYear < endYear ? startYear : endYear;
    var to = startYear < endYear ? endYear : startYear;
    for (var y = from; y <= to; y++) {
      for (var m = 1; m <= 12; m++) out.push({ y: y, m: m });
    }
    return out;
  }

  function segmentInMonth(plan, y, m) {
    var start = plan.start;
    var end = plan.end < plan.start ? plan.start : plan.end;
    var dim = daysInMonth(y, m);
    var from = y + "-" + pad(m) + "-01";
    var to = y + "-" + pad(m) + "-" + pad(dim);
    if (end < from || start > to) return null;
    var sliceStart = start > from ? start : from;
    var sliceEnd = end < to ? end : to;
    var sp = parse(sliceStart);
    var ep = parse(sliceEnd);
    if (!sp || !ep) return null;
    return {
      planId: plan.id,
      plan: plan,
      y: y,
      month: m,
      startDay: sp.d,
      endDay: ep.d,
      continuesBefore: start < from,
      continuesAfter: end > to,
      days: diffDays(start, end) + 1
    };
  }

  var FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function monthAwayDetail(plans, y, m) {
    var dim = daysInMonth(y, m);
    var from = y + "-" + pad(m) + "-01";
    var to = y + "-" + pad(m) + "-" + pad(dim);
    var rows = [];
    (plans || []).forEach(function (plan) {
      if (!isTrip(plan) || !plan || !parse(plan.start) || !parse(plan.end)) return;
      var start = plan.start < plan.end ? plan.start : plan.end;
      var end = plan.end < plan.start ? plan.start : plan.end;
      if (end < from || start > to) return;
      var clipStart = start < from ? from : start;
      var clipEnd = end > to ? to : end;
      rows.push({
        id: plan.id ? String(plan.id) : "",
        title: String(plan.title || ""),
        color: plan.color || "",
        start: clipStart,
        end: clipEnd,
        days: diffDays(clipStart, clipEnd) + 1
      });
    });
    rows.sort(function (a, b) {
      if (a.start < b.start) return -1;
      if (a.start > b.start) return 1;
      return 0;
    });
    return {
      label: FULL_MONTHS[m - 1] + " " + y,
      days: monthDaysAway(plans || [], y, m),
      plans: rows
    };
  }

  function monthDaysAway(plans, y, m) {
    var seen = Object.create(null);
    var dim = daysInMonth(y, m);
    var from = y + "-" + pad(m) + "-01";
    var to = y + "-" + pad(m) + "-" + pad(dim);
    (plans || []).forEach(function (plan) {
      if (!isTrip(plan)) return;
      var start = plan.start < from ? from : plan.start;
      var end = plan.end > to ? to : plan.end;
      if (plan.end < from || plan.start > to || end < start) return;
      var cursor = start;
      var guard = 0;
      while (cursor <= end && guard < 40) {
        seen[cursor] = true;
        cursor = addDays(cursor, 1);
        guard += 1;
      }
    });
    return Object.keys(seen).length;
  }

  function layoutMonths(plans, months) {
    var bars = [];
    var singles = [];
    var lanes = Object.create(null);
    months.forEach(function (month) {
      var key = month.y + "-" + pad(month.m);
      var segs = [];
      plans.forEach(function (plan) {
        var seg = segmentInMonth(plan, month.y, month.m);
        if (!seg) return;
        if (isSingleDay(plan)) singles.push(seg);
        else segs.push(seg);
      });
      segs.sort(function (a, b) {
        return a.startDay - b.startDay || a.endDay - b.endDay;
      });
      var laneEnds = [];
      segs.forEach(function (seg) {
        var lane = -1;
        for (var i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] < seg.startDay) {
            lane = i;
            break;
          }
        }
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(seg.endDay);
        } else {
          laneEnds[lane] = seg.endDay;
        }
        seg.lane = lane;
        bars.push(seg);
      });
      lanes[key] = laneEnds.length || 1;
    });
    return { bars: bars, lanes: lanes, singles: singles };
  }

  function segmentsFor(plan, year) {
    var start = utc(plan.start);
    var end = utc(plan.end);
    if (isNaN(start) || isNaN(end)) return [];
    if (end < start) end = start;
    var out = [];
    var cursor = start;
    while (cursor <= end) {
      var dt = new Date(cursor);
      var y = dt.getUTCFullYear();
      var m = dt.getUTCMonth();
      var monthEnd = Date.UTC(y, m + 1, 0);
      var sliceEnd = Math.min(end, monthEnd);
      if (y === year) {
        out.push({
          planId: plan.id,
          month: m + 1,
          startDay: dt.getUTCDate(),
          endDay: new Date(sliceEnd).getUTCDate()
        });
      }
      cursor = Date.UTC(y, m + 1, 1);
    }
    return out;
  }

  function layout(plans, fromIso, toIso) {
    return layoutMonths(plans, monthsInDateRange(fromIso, toIso));
  }

  var LEGACY_TAGS = {
    travel: { tag: "Travel", color: "#74a869" },
    work: { tag: "Work", color: "#37a388" },
    personal: { tag: "Personal", color: "#c0d1a4" },
    other: { tag: "Other", color: "#54bda1" }
  };

  function hexColor(value) {
    var text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : "";
  }

  /* Theme swatches used when the page has not painted computed colors. */
  var THEME_SWATCHES = ["#74a869", "#37a388", "#c0d1a4", "#54bda1", "#41a468", "#e6d48a"];

  function rgbOf(hex) {
    var color = hexColor(hex);
    if (!color) return null;
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16)
    ];
  }

  function nearestSwatch(hex, palette) {
    var list = [];
    var source = palette && palette.length ? palette : THEME_SWATCHES;
    source.forEach(function (item) {
      var color = hexColor(item);
      if (color) list.push(color);
    });
    if (!list.length) list = THEME_SWATCHES.slice();
    var rgb = rgbOf(hex);
    if (!rgb) return list[0];
    var best = list[0];
    var bestDistance = Infinity;
    list.forEach(function (color) {
      var other = rgbOf(color);
      var distance = (rgb[0] - other[0]) * (rgb[0] - other[0])
        + (rgb[1] - other[1]) * (rgb[1] - other[1])
        + (rgb[2] - other[2]) * (rgb[2] - other[2]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = color;
      }
    });
    return best;
  }

  function gcalPlain(value) {
    var text = String(value || "").replace(/\r\n/g, "\n");
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n");
    text = text.replace(/<[^>]*>/g, "");
    text = text.replace(/&nbsp;/gi, " ");
    text = text.replace(/&amp;/gi, "&");
    text = text.replace(/&lt;/gi, "<");
    text = text.replace(/&gt;/gi, ">");
    text = text.replace(/&quot;/gi, "\"");
    text = text.replace(/&#0*39;|&#x0*27;/gi, "'");
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  function gcalSafeLink(url) {
    var text = String(url || "").trim().slice(0, 2000);
    if (!/^https:\/\/(www\.google\.com|calendar\.google\.com)\//i.test(text)) return "";
    return text;
  }

  function gcalPoint(point, exclusiveEnd) {
    if (!point || typeof point !== "object") return "";
    if (point.date && parse(point.date)) {
      return exclusiveEnd ? addDays(point.date, -1) : point.date;
    }
    var stamp = String(point.dateTime || "");
    var match = stamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (!match || !parse(match[1])) return "";
    if (exclusiveEnd && match[2] === "00" && match[3] === "00") return addDays(match[1], -1);
    return match[1];
  }

  function gcalClock(point) {
    var stamp = String(point && point.dateTime || "");
    var match = stamp.match(/T(\d{2}):(\d{2})/);
    if (!match) return "";
    return String(+match[1]) + ":" + match[2];
  }

  function gcalSpan(event) {
    var start = gcalPoint(event && event.start, false);
    if (!start) return null;
    var end = gcalPoint(event && event.end, true);
    if (!end || end < start) end = start;
    return { start: start, end: end, days: inclusiveDays(start, end) };
  }

  var GCAL_TAGS = {
    fromGmail: "Gmail",
    outOfOffice: "Out of office",
    focusTime: "Focus",
    workingLocation: "Location",
    birthday: "Birthday"
  };

  function gcalTag(event) {
    var typed = event && GCAL_TAGS[event.eventType];
    if (typed) return typed;
    var source = event && event.source && event.source.title;
    return source ? gcalPlain(source).slice(0, 24) : "";
  }

  function gcalKey(calendar, event) {
    var cal = calendar && calendar.id ? String(calendar.id) : "";
    var id = event && event.id ? String(event.id) : "";
    if (!cal || !id) return "";
    return (cal + ":" + id).slice(0, 400);
  }

  function gcalEventToPlan(event, calendar, palette) {
    if (!event || event.status === "cancelled") return null;
    var key = gcalKey(calendar, event);
    var span = gcalSpan(event);
    if (!key || !span) return null;
    var title = gcalPlain(event.summary) || "Busy";
    var location = gcalPlain(event.location);
    var description = gcalPlain(event.description);
    var note = location && description ? location + "\n" + description : (location || description);
    var color = nearestSwatch(calendar && calendar.backgroundColor, palette);
    var clock = gcalClock(event.start);
    var endClock = gcalClock(event.end);
    if (endClock === "0:00") endClock = "";
    return normalize({
      id: "gcal-" + key,
      title: title,
      tag: gcalTag(event),
      type: span.days >= 2 ? "Trip" : "Event",
      color: color,
      note: note,
      time: clock,
      endTime: endClock,
      location: location,
      start: span.start,
      end: span.end,
      source: "gcal",
      gcalId: key,
      etag: event.etag || "",
      htmlLink: event.htmlLink || "",
      gcalCal: calendar && calendar.id ? String(calendar.id) : ""
    });
  }

  function applyGcalChanges(plans, events, calendar, palette) {
    var next = (plans || []).slice();
    var removed = 0;
    var upserted = 0;
    (events || []).forEach(function (event) {
      if (!event || typeof event !== "object") return;
      var key = gcalKey(calendar, event);
      if (!key) return;
      var index = -1;
      for (var i = 0; i < next.length; i++) {
        if (next[i] && next[i].gcalId === key) {
          index = i;
          break;
        }
      }
      if (event.status === "cancelled") {
        if (index >= 0) {
          next.splice(index, 1);
          removed += 1;
        }
        return;
      }
      var plan = gcalEventToPlan(event, calendar, palette);
      if (!plan) return;
      if (index >= 0) {
        plan.id = next[index].id || plan.id;
        next[index] = plan;
      } else {
        next.push(plan);
      }
      upserted += 1;
    });
    return { plans: next, removed: removed, upserted: upserted };
  }

  function gcalSyncedCaption(at, now) {
    var then = +at;
    var clock = +now;
    if (!then || !clock || clock < then) return "Not synced yet";
    var mins = Math.round((clock - then) / 60000);
    if (mins < 1) return "Synced just now";
    if (mins === 1) return "Synced 1 min ago";
    return "Synced " + mins + " min ago";
  }

  function gcalNeedsFullSync(status) {
    return status === 410;
  }

  function gcalTokenRejected(status) {
    return status === 401 || status === 403;
  }

  function filterPlans(plans, fromIso, toIso, tag, query) {
    var q = String(query || "").trim().toLowerCase();
    return plans.filter(function (plan) {
      if (!overlapsRange(plan, fromIso, toIso)) return false;
      if (tag && tag !== "all" && plan.tag !== tag) return false;
      if (!q) return true;
      var title = plan.title.toLowerCase();
      var label = String(plan.tag || "").toLowerCase();
      var note = String(plan.note || "").toLowerCase();
      return title.indexOf(q) !== -1 || label.indexOf(q) !== -1 || note.indexOf(q) !== -1;
    });
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") return null;
    var title = String(raw.title || "").trim();
    var start = parse(raw.start);
    var end = parse(raw.end);
    if (!title || !start || !end) return null;
    var startIso = start.y + "-" + pad(start.m) + "-" + pad(start.d);
    var endIso = end.y + "-" + pad(end.m) + "-" + pad(end.d);
    if (endIso < startIso) endIso = startIso;
    if (isNaN(utc(startIso)) || isNaN(utc(endIso))) return null;
    if (start.d > daysInMonth(start.y, start.m)) return null;
    var endParts = parse(endIso);
    if (endParts.d > daysInMonth(endParts.y, endParts.m)) return null;
    var tag = String(raw.tag || "").trim();
    var color = hexColor(raw.color);
    var legacy = LEGACY_TAGS[raw.category];
    if (!tag && legacy) tag = legacy.tag;
    if (!color && legacy) color = legacy.color;
    if (!color) color = "#74a869";
    var type = PLAN_TYPES[raw.type] ? raw.type : "";
    var checklist = [];
    if (Array.isArray(raw.checklist)) {
      raw.checklist.forEach(function (item) {
        if (!item || typeof item !== "object" || checklist.length >= 40) return;
        var text = String(item.text || "").trim().slice(0, 200);
        if (!text) return;
        checklist.push({
          id: item.id ? String(item.id).slice(0, 40) : "",
          text: text,
          done: !!item.done
        });
      });
    }
    var images = [];
    if (Array.isArray(raw.images)) {
      raw.images.forEach(function (item) {
        if (!item || typeof item.src !== "string" || item.src.indexOf("data:image/") !== 0) return;
        if (images.length >= 4) return;
        images.push({
          name: String(item.name || "image").slice(0, 80),
          src: item.src
        });
      });
    }
    var plan = {
      id: raw.id ? String(raw.id) : "",
      title: title.slice(0, 200),
      tag: tag.slice(0, 24),
      color: color,
      note: String(raw.note || "").trim().slice(0, 5000),
      images: images,
      start: startIso,
      end: endIso
    };
    if (type) plan.type = type;
    if (checklist.length) plan.checklist = checklist;
    if (raw.source === "gcal") plan.source = "gcal";
    if (raw.gcalId) plan.gcalId = String(raw.gcalId).slice(0, 400);
    if (raw.etag) plan.etag = String(raw.etag).slice(0, 200);
    var link = gcalSafeLink(raw.htmlLink);
    if (link) plan.htmlLink = link;
    if (raw.gcalCal) plan.gcalCal = String(raw.gcalCal).slice(0, 320);
    var when = clockText(raw.time);
    if (when) plan.time = when;
    var until = clockText(raw.endTime);
    if (until) plan.endTime = until;
    var place = String(raw.location || "").trim().slice(0, 120);
    if (place) plan.location = place;
    return plan;
  }

  function clockText(value) {
    var match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    var hour = +match[1];
    if (hour > 23 || +match[2] > 59) return "";
    return String(hour) + ":" + match[2];
  }

  function icsClock(value) {
    var text = clockText(value);
    if (!text) return "";
    var parts = text.split(":");
    return (parts[0].length < 2 ? "0" : "") + parts[0] + parts[1] + "00";
  }

  /* All-day events use VALUE=DATE. Timed events use a local DTSTART/DTEND. */
  function icsBounds(plan) {
    var start = String(plan && plan.start || "");
    var end = String(plan && plan.end || start);
    var time = clockText(plan && plan.time);
    var endTime = clockText(plan && plan.endTime);
    if (!time && !endTime) {
      return {
        start: "DTSTART;VALUE=DATE:" + start.replace(/-/g, ""),
        end: "DTEND;VALUE=DATE:" + addDays(end, 1).replace(/-/g, "")
      };
    }
    var startClock = time || endTime;
    var finishClock = endTime || time;
    return {
      start: "DTSTART:" + start.replace(/-/g, "") + "T" + icsClock(startClock),
      end: "DTEND:" + end.replace(/-/g, "") + "T" + icsClock(finishClock)
    };
  }

  function readIcsPoint(line) {
    var text = String(line || "");
    var cut = text.indexOf(":");
    var head = cut >= 0 ? text.slice(0, cut) : "";
    var value = cut >= 0 ? text.slice(cut + 1) : text;
    var digits = value.replace(/[^0-9]/g, "");
    if (digits.length < 8) return null;
    var iso = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8);
    if (!parse(iso)) return null;
    var dateOnly = /VALUE=DATE/i.test(head) || digits.length < 12;
    var time = "";
    if (!dateOnly) time = String(+digits.slice(8, 10)) + ":" + digits.slice(10, 12);
    return { iso: iso, time: time, dateOnly: dateOnly };
  }

  /* Date-only DTEND is the morning after the last day. A midnight time is the same. */
  function readIcsSpan(startLine, endLine) {
    var start = readIcsPoint(startLine);
    if (!start) return null;
    var end = endLine ? readIcsPoint(endLine) : null;
    var endIso = start.iso;
    var endTime = "";
    if (end) {
      endIso = end.iso;
      if (end.dateOnly || end.time === "0:00") {
        endIso = addDays(end.iso, -1);
        if (!endIso || endIso < start.iso) endIso = start.iso;
      } else {
        endTime = end.time;
      }
    }
    if (endIso < start.iso) endIso = start.iso;
    return {
      start: start.iso,
      end: endIso,
      time: start.dateOnly ? "" : start.time,
      endTime: endTime
    };
  }

  function makePlan(base, patch) {
    var src = base && typeof base === "object" ? base : {};
    var over = patch && typeof patch === "object" ? patch : {};
    function pick(key) {
      if (Object.prototype.hasOwnProperty.call(over, key)) return over[key];
      return src[key];
    }
    return normalize({
      id: pick("id"),
      title: pick("title"),
      tag: pick("tag"),
      type: pick("type"),
      color: pick("color"),
      note: pick("note"),
      checklist: pick("checklist"),
      images: pick("images"),
      start: pick("start"),
      end: pick("end"),
      category: pick("category"),
      source: pick("source"),
      gcalId: pick("gcalId"),
      etag: pick("etag"),
      htmlLink: pick("htmlLink"),
      gcalCal: pick("gcalCal"),
      time: pick("time"),
      endTime: pick("endTime"),
      location: pick("location")
    });
  }

  function backupTooLarge(bytes) {
    return bytes > 20 * 1024 * 1024;
  }

  function selfCheck() {
    var errors = [];
    if (SAMPLE.length !== 10) errors.push("sample count " + SAMPLE.length);
    var trips = SAMPLE.filter(function (p) { return p.tag === "Trip"; }).length;
    if (trips !== 10) errors.push("trips " + trips);
    var days = daysAway(SAMPLE, 2026);
    if (days !== 56) errors.push("days away " + days);
    if (parse("2026-02-31") !== null) errors.push("feb 31");
    if (parse("2026-02-29") !== null) errors.push("non-leap");
    if (!parse("2024-02-29")) errors.push("leap day");
    if (parse("2026-1-01") !== null) errors.push("unpadded");
    if (parse("not-a-date") !== null) errors.push("text date");
    if (normalize({ title: "Nope", start: "2026-02-31", end: "2026-03-01" })) errors.push("nan import");
    if (normalize({ title: "Nope", start: "NaN-NaN-NaN", end: "2026-01-01" })) errors.push("nan text");
    if (weekdayLetter(2026, 1, 1) !== "Thu") errors.push("jan 1 " + weekdayLetter(2026, 1, 1));
    if (daysInMonth(2026, 2) !== 28) errors.push("feb 2026");
    if (daysInMonth(2024, 2) !== 29) errors.push("feb 2024");
    if (easterSunday(2024) !== "2024-03-31") errors.push("easter 2024 " + easterSunday(2024));
    if (easterSunday(2025) !== "2025-04-20") errors.push("easter 2025 " + easterSunday(2025));
    if (easterSunday(2026) !== "2026-04-05") errors.push("easter 2026 " + easterSunday(2026));
    if (easterSunday(2027) !== "2027-03-28") errors.push("easter 2027 " + easterSunday(2027));
    function expectHoliday(y, name, date) {
      var found = holidaysForYear(y).filter(function (item) { return item.name === name; });
      if (found.length !== 1 || found[0].date !== date) errors.push(name + " " + y + " " + JSON.stringify(found));
    }
    expectHoliday(2026, "New Year's Day", "2026-01-01");
    expectHoliday(2026, "MLK Day", "2026-01-19");
    expectHoliday(2026, "Valentine's Day", "2026-02-14");
    expectHoliday(2026, "Presidents' Day", "2026-02-16");
    expectHoliday(2026, "Easter", "2026-04-05");
    expectHoliday(2026, "Mother's Day", "2026-05-10");
    expectHoliday(2026, "Memorial Day", "2026-05-25");
    expectHoliday(2026, "Juneteenth", "2026-06-19");
    expectHoliday(2026, "Father's Day", "2026-06-21");
    expectHoliday(2026, "Independence Day (observed)", "2026-07-03");
    expectHoliday(2026, "Independence Day", "2026-07-04");
    expectHoliday(2026, "Labor Day", "2026-09-07");
    expectHoliday(2026, "Columbus / Indigenous Peoples' Day", "2026-10-12");
    expectHoliday(2026, "Halloween", "2026-10-31");
    expectHoliday(2026, "Veterans Day", "2026-11-11");
    expectHoliday(2026, "Thanksgiving", "2026-11-26");
    expectHoliday(2026, "Christmas", "2026-12-25");
    expectHoliday(2026, "New Year's Eve", "2026-12-31");
    expectHoliday(2027, "New Year's Day", "2027-01-01");
    expectHoliday(2027, "MLK Day", "2027-01-18");
    expectHoliday(2027, "Valentine's Day", "2027-02-14");
    expectHoliday(2027, "Presidents' Day", "2027-02-15");
    expectHoliday(2027, "Easter", "2027-03-28");
    expectHoliday(2027, "Mother's Day", "2027-05-09");
    expectHoliday(2027, "Memorial Day", "2027-05-31");
    expectHoliday(2027, "Juneteenth (observed)", "2027-06-18");
    expectHoliday(2027, "Juneteenth", "2027-06-19");
    expectHoliday(2027, "Father's Day", "2027-06-20");
    expectHoliday(2027, "Independence Day", "2027-07-04");
    expectHoliday(2027, "Independence Day (observed)", "2027-07-05");
    expectHoliday(2027, "Labor Day", "2027-09-06");
    expectHoliday(2027, "Columbus / Indigenous Peoples' Day", "2027-10-11");
    expectHoliday(2027, "Halloween", "2027-10-31");
    expectHoliday(2027, "Veterans Day", "2027-11-11");
    expectHoliday(2027, "Thanksgiving", "2027-11-25");
    expectHoliday(2027, "Christmas (observed)", "2027-12-24");
    expectHoliday(2027, "Christmas", "2027-12-25");
    expectHoliday(2027, "New Year's Eve", "2027-12-31");
    expectHoliday(2027, "New Year's Day (observed)", "2027-12-31");
    function observedKey(year) {
      return holidaysForYear(year).filter(function (item) { return item.kind === "observed"; }).map(function (item) {
        return item.name + "@" + item.date;
      }).sort().join("|");
    }
    if (observedKey(2026) !== "Independence Day (observed)@2026-07-03") errors.push("2026 observed " + observedKey(2026));
    if (observedKey(2027) !== "Christmas (observed)@2027-12-24|Independence Day (observed)@2027-07-05|Juneteenth (observed)@2027-06-18|New Year's Day (observed)@2027-12-31") {
      errors.push("2027 observed " + observedKey(2027));
    }
    if (holidaysForYear(2026).length !== 18) errors.push("2026 holiday count " + holidaysForYear(2026).length);
    if (holidaysForYear(2027).length !== 21) errors.push("2027 holiday count " + holidaysForYear(2027).length);
    if (daysAway(SAMPLE, 2026) !== 56) errors.push("holidays changed days away");
    if (countTrips(SAMPLE) !== 10) errors.push("holidays changed trip count");
    if (holidaysForYear(2026).some(function (item) { return item.start || item.type; })) errors.push("holiday is a plan");
    var dec = segmentsFor(
      { id: "x", title: "x", tag: "Trip", color: "#74a869", start: "2026-12-30", end: "2027-01-02" },
      2026
    );
    if (dec.length !== 1 || dec[0].startDay !== 30 || dec[0].endDay !== 31) {
      errors.push("dec segment " + JSON.stringify(dec));
    }
    var jan = segmentsFor(
      { id: "x", title: "x", tag: "Trip", color: "#74a869", start: "2026-12-30", end: "2027-01-02" },
      2027
    );
    if (jan.length !== 1 || jan[0].month !== 1 || jan[0].startDay !== 1 || jan[0].endDay !== 2) {
      errors.push("jan segment " + JSON.stringify(jan));
    }
    var stacked = layout([
      { id: "a", title: "A", category: "work", start: "2026-05-01", end: "2026-05-10" },
      { id: "b", title: "B", category: "personal", start: "2026-05-08", end: "2026-05-12" }
    ], "2026-01-01", "2026-12-31");
    var may = stacked.bars.filter(function (b) { return b.month === 5; });
    if (may.length !== 2 || may[0].lane === may[1].lane) errors.push("lanes");
    if (stacked.lanes["2026-05"] !== 2) errors.push("lane count");
    var span = layout([
      { id: "x", title: "x", tag: "Trip", color: "#74a869", start: "2026-12-30", end: "2027-01-02" }
    ], "2026-01-01", "2027-12-31");
    var seenSpan = {};
    span.bars.forEach(function (bar) { seenSpan[bar.y + "-" + bar.month] = true; });
    if (!seenSpan["2026-12"] || !seenSpan["2027-1"]) errors.push("range layout");
    var away = daysAway([
      { id: "a", title: "A", tag: "Trip", color: "#74a869", start: "2026-06-28", end: "2026-07-02" },
      { id: "b", title: "B", tag: "Trip", color: "#74a869", start: "2026-07-02", end: "2026-07-03" }
    ], 2026);
    if (away !== 6) errors.push("unique days " + away);
    if (filterPlans(SAMPLE, "2026-01-01", "2026-12-31", "Work", "").length !== 0) errors.push("tag filter");
    if (filterPlans(SAMPLE, "2026-01-01", "2026-12-31", "Trip", "").length !== 10) errors.push("trip filter");
    if (filterPlans(SAMPLE, "2026-01-01", "2026-12-31", "all", "workshop").length !== 3) errors.push("search");
    if (filterPlans([
      { id: "z", title: "Z", tag: "Trip", color: "#74a869", start: "2025-12-01", end: "2025-12-02" }
    ], "2026-01-01", "2026-12-31", "all", "").length !== 0) errors.push("range exclude");
    if (addDays("2026-01-30", 3) !== "2026-02-02") errors.push("addDays " + addDays("2026-01-30", 3));
    if (addDays("2026-03-01", -1) !== "2026-02-28") errors.push("addDays back");
    if (diffDays("2026-06-06", "2026-06-10") !== 4) errors.push("diffDays");
    var cross = segmentInMonth(
      { id: "x", title: "x", start: "2026-12-30", end: "2027-01-02" },
      2026,
      12
    );
    if (!cross || !cross.continuesAfter || cross.continuesBefore || cross.startDay !== 30) {
      errors.push("cross dec");
    }
    var crossJan = segmentInMonth(
      { id: "x", title: "x", start: "2026-12-30", end: "2027-01-02" },
      2027,
      1
    );
    if (!crossJan || !crossJan.continuesBefore || crossJan.continuesAfter || crossJan.endDay !== 2) {
      errors.push("cross jan");
    }
    if (monthDaysAway([
      { start: "2024-02-28", end: "2024-03-01" }
    ], 2024, 2) !== 2) errors.push("leap days");
    if (monthsInRange(2026, 2027).length !== 24) errors.push("range");
    var noted = normalize({
      title: "N",
      start: "2026-01-01",
      end: "2026-01-02",
      note: "  pack https://example.com  ",
      images: [{ name: "map", src: "data:image/png;base64,aaa" }, { src: "nope" }]
    });
    if (!noted || noted.note !== "pack https://example.com" || noted.images.length !== 1) {
      errors.push("note");
    }
    if (inclusiveDays("2026-02-21", "2026-03-06") !== 14) errors.push("inclusive span");
    if (inclusiveDays("2026-03-06", "2026-02-21") !== 14) errors.push("inclusive swap");
    if (inclusiveDays("2026-06-01", "2026-06-01") !== 1) errors.push("inclusive one");
    if (inclusiveDays("2024-02-28", "2024-03-01") !== 3) errors.push("inclusive leap");
    if (rangeCountLabel("2026-02-21", "2026-03-06") !== "Feb 21 – Mar 6 · 14 days") {
      errors.push("range label " + rangeCountLabel("2026-02-21", "2026-03-06"));
    }
    if (rangeCountLabel("2026-06-01", "2026-06-01") !== "Jun 1 · 1 day") {
      errors.push("range label one " + rangeCountLabel("2026-06-01", "2026-06-01"));
    }
    var rollingEmpty = rollingRange({ y: 2026, m: 10, d: 25 }, []);
    if (rollingEmpty.start !== 2025 || rollingEmpty.end !== 2028) errors.push("rolling empty");
    var rollingInside = rollingRange({ y: 2026, m: 6, d: 1 }, [
      { start: "2026-01-05", end: "2026-01-11" }
    ]);
    if (rollingInside.start !== 2025 || rollingInside.end !== 2028) errors.push("rolling inside");
    var rollingWide = rollingRange({ y: 2026, m: 1, d: 1 }, [
      { start: "2025-12-30", end: "2026-01-02" },
      { start: "2028-05-01", end: "2028-05-04" },
      { start: "nope", end: "nope" }
    ]);
    if (rollingWide.start !== 2025 || rollingWide.end !== 2028) errors.push("rolling wide");
    var rollingCap = rollingRange({ y: 2026, m: 6, d: 15 }, [
      { start: "2001-01-01", end: "2001-01-05" },
      { start: "2023-12-01", end: "2023-12-02" },
      { start: "2024-02-01", end: "2024-02-02" },
      { start: "2029-11-01", end: "2029-11-03" },
      { start: "2099-01-01", end: "2099-01-08" }
    ]);
    if (rollingCap.start !== 2024 || rollingCap.end !== 2029) {
      errors.push("rolling cap " + rollingCap.start + "-" + rollingCap.end);
    }
    var rollingSpan = rollingRange({ y: 2026, m: 1, d: 1 }, [
      { start: "2023-06-01", end: "2030-06-01" }
    ]);
    if (rollingSpan.start !== 2024 || rollingSpan.end !== 2029) errors.push("rolling span cap");
    var rollingTypo = rollingRange({ y: 2026, m: 1, d: 1 }, [
      { start: "2099-01-01", end: "2099-01-08" }
    ]);
    if (rollingTypo.start !== 2025 || rollingTypo.end !== 2028) errors.push("rolling typo");
    var browseNow = browseSpan(2026);
    if (browseNow.start !== 2025 || browseNow.end !== 2028) errors.push("browse now");
    var browseNext = browseSpan(2027);
    if (browseNext.start !== 2025 || browseNext.end !== 2029) errors.push("browse 2027");
    var browseLater = browseSpan(2030);
    if (browseLater.start !== 2029 || browseLater.end !== 2032) errors.push("browse later");
    var browseEarly = browseSpan(2020);
    if (browseEarly.start !== 2019 || browseEarly.end !== 2028) errors.push("browse early");
    var boardMonths = monthsInRange(2025, 2028);
    if (boardMonths.length !== 48) errors.push("board months");
    if (!boardMonths[24] || boardMonths[24].y !== 2027 || boardMonths[24].m !== 1) errors.push("2027 divider month");
    var navStart = yearNavEnds(2025, 2025, 2028);
    var navMid = yearNavEnds(2026, 2025, 2028);
    var navEnd = yearNavEnds(2028, 2025, 2028);
    if (!navStart.prev || navStart.next || navMid.prev || navMid.next || navEnd.prev || !navEnd.next) {
      errors.push("year nav ends");
    }
    var slotWide = labelSlot(1, 10, [2, 3]);
    if (slotWide.from !== 4 || slotWide.span !== 7) errors.push("label slot wide " + slotWide.from);
    var slotNear = labelSlot(1, 10, [5]);
    if (slotNear.from !== 6 || slotNear.span !== 5) errors.push("label slot near");
    var slotEarly = labelSlot(1, 6, [3, 4]);
    if (slotEarly.from !== 1 || slotEarly.span !== 2) errors.push("label slot tie");
    var slotFull = labelSlot(4, 8, [4, 5, 6, 7, 8]);
    if (slotFull.from !== 1 || slotFull.span !== 5) errors.push("label slot blocked");
    var familyWrap = wrapLabels([
      { span: 24, continuesAfter: true },
      { span: 2, continuesBefore: true }
    ]);
    if (!familyWrap[0].show || familyWrap[0].lead !== 0 || familyWrap[0].tail !== 2) errors.push("wrap long");
    if (familyWrap[1].show || familyWrap[1].lead !== 2) errors.push("wrap stub");
    var similarWrap = wrapLabels([
      { span: 12, continuesAfter: true },
      { span: 10, continuesBefore: true }
    ]);
    if (!similarWrap[0].show || !similarWrap[1].show) errors.push("wrap similar");
    if (similarWrap[0].tail !== 2 || similarWrap[1].lead !== 2) errors.push("wrap similar fade");
    var shortWrap = wrapLabels([
      { span: 1, continuesAfter: true },
      { span: 1, continuesBefore: true }
    ]);
    if (shortWrap[0].show || shortWrap[1].show) errors.push("wrap short");
    var middleWrap = wrapLabels([
      { span: 3, continuesAfter: true },
      { span: 31, continuesBefore: true, continuesAfter: true },
      { span: 4, continuesBefore: true }
    ]);
    if (middleWrap[0].show || !middleWrap[1].show || middleWrap[1].lead !== 2 || middleWrap[1].tail !== 2 || middleWrap[2].show) {
      errors.push("wrap middle");
    }
    var plainWrap = wrapLabels([{ span: 5 }]);
    if (!plainWrap[0].show || plainWrap[0].lead || plainWrap[0].tail) errors.push("wrap plain");
    if (planSpanPhrase("2026-11-07", "2026-12-02") !== "Sat Nov 7 – Wed Dec 2") errors.push("span phrase");
    if (planSpanPhrase("2026-10-26", "2026-10-26") !== "Mon Oct 26") errors.push("span one");
    if (planLengthPhrase("2026-11-07", "2026-12-02") !== "26 days") errors.push("length phrase");
    if (planTimingPhrase("2026-11-07", "2026-12-02", "2026-10-26") !== "12 days until it starts") errors.push("timing before");
    if (planTimingPhrase("2026-11-07", "2026-12-02", "2026-11-07") !== "in progress, 26 days left") errors.push("timing start");
    if (planTimingPhrase("2026-11-07", "2026-12-02", "2026-12-02") !== "in progress, 1 day left") errors.push("timing end");
    if (planTimingPhrase("2026-11-07", "2026-12-02", "2026-12-03") !== "ended 1 day ago") errors.push("timing after");
    if (dragPastThreshold(5, 0) || dragPastThreshold(0, 5.9)) errors.push("drag under");
    if (!dragPastThreshold(6, 0) || !dragPastThreshold(5, 4)) errors.push("drag over");
    if (planGesture("body", false) !== "none" || planGesture("end", false) !== "none") errors.push("gesture click");
    if (planGesture("body", true) !== "move") errors.push("gesture move");
    if (planGesture("start", true) !== "resize" || planGesture("end", true) !== "resize") errors.push("gesture resize");
    if (planGesture("away", true) !== "none") errors.push("gesture other");
    if (moveCommit(10, 0, 40, 56) || moveCommit(5, 0, 40, 56) || moveCommit(39, 49, 40, 56)) errors.push("move short");
    if (!moveCommit(40, 0, 40, 56) || !moveCommit(0, 56, 40, 56)) errors.push("move cell");
    var oneChip = dayChipStack(1);
    var twoChip = dayChipStack(2);
    var fourChip = dayChipStack(4);
    var noneChip = dayChipStack(0);
    if (oneChip.visible !== 1 || oneChip.more !== 0 || oneChip.rows !== 1) errors.push("chip one");
    if (twoChip.visible !== 2 || twoChip.more !== 0 || twoChip.rows !== 2) errors.push("chip two");
    if (fourChip.visible !== 1 || fourChip.more !== 3 || fourChip.rows !== 2) errors.push("chip more");
    if (noneChip.visible !== 0 || noneChip.rows !== 0) errors.push("chip none");
    if (!chipUsesInitial(35) || chipUsesInitial(36) || chipUsesInitial(80)) errors.push("chip narrow");
    if (chipInitial("soccer") !== "S" || chipInitial("  tx ") !== "T" || chipInitial("") !== "") errors.push("chip initial");
    if (pinButtonAction(false, false) !== "ask-pin" || pinButtonAction(false, true) !== "ask-unpin") errors.push("pin ask");
    if (pinButtonAction(true, false) !== "pin" || pinButtonAction(true, true) !== "unpin") errors.push("pin skip");
    var oneDay = selectionSpan("2026-10-26", "2026-10-26");
    if (!oneDay || oneDay.start !== "2026-10-26" || oneDay.end !== "2026-10-26" || oneDay.edge !== "end") errors.push("select one");
    var grown = extendSelection(oneDay, "2026-11-02");
    if (!grown || grown.start !== "2026-10-26" || grown.end !== "2026-11-02" || grown.anchor !== "2026-10-26" || grown.edge !== "end") {
      errors.push("select extend");
    }
    var shrunk = extendSelection(grown, "2026-10-20");
    if (!shrunk || shrunk.start !== "2026-10-20" || shrunk.end !== "2026-10-26" || shrunk.edge !== "start") errors.push("select flip");
    var nudged = nudgeSelection(oneDay, 1);
    if (!nudged || nudged.end !== "2026-10-27" || nudged.anchor !== "2026-10-26") errors.push("select nudge");
    var nudgedBack = nudgeSelection(oneDay, -1);
    if (!nudgedBack || nudgedBack.start !== "2026-10-25" || nudgedBack.edge !== "start") errors.push("select nudge back");
    if (awayToggle("", "2026-06") !== "2026-06") errors.push("away open");
    if (awayToggle("2026-06", "2026-06") !== "") errors.push("away close");
    if (awayToggle("2026-06", "2026-07") !== "2026-07") errors.push("away switch");
    if (awayToggle("2026-06", "") !== "") errors.push("away clear");
    var outside = plansOutsideRange([
      { id: "old", title: "Old", start: "2001-01-01", end: "2001-01-02" },
      { id: "edge", title: "Edge", start: "2023-12-30", end: "2024-01-02" },
      { id: "in", title: "In", start: "2026-05-01", end: "2026-05-02" },
      { id: "typo", title: "Typo", start: "2099-01-01", end: "2099-01-04" }
    ], 2024, 2029);
    if (outside.length !== 2 || outside[0].id !== "old" || outside[1].id !== "typo") {
      errors.push("outside range");
    }
    var kept = [{ id: "a", title: "Keep", start: "2026-01-01", end: "2026-01-02", images: [{ name: "m", src: "data:image/png;base64,aaa" }] }];
    var imported = [{ id: "a", title: "Imported", start: "2026-02-01", end: "2026-02-02", images: [] }];
    var seq = 0;
    var merged = mergePlans(kept, imported, function () { seq += 1; return "new-" + seq; });
    if (merged.length !== 2 || merged[0].id !== "a" || merged[0].title !== "Keep") errors.push("merge keep");
    if (!merged[0].images || merged[0].images.length !== 1) errors.push("merge images");
    if (merged[1].id !== "new-1" || merged[1].title !== "Imported") errors.push("merge copy");
    if (kept[0].title !== "Keep" || imported[0].id !== "a") errors.push("merge mutate");
    var dupIncoming = mergePlans([], [
      { id: "a", title: "First", start: "2026-01-01", end: "2026-01-01" },
      { id: "a", title: "Second", start: "2026-01-02", end: "2026-01-02" }
    ], function () { seq += 1; return "id-" + seq; });
    if (dupIncoming.length !== 2 || dupIncoming[0].id === dupIncoming[1].id) errors.push("merge dup incoming");
    if (dupIncoming[0].title !== "First" || dupIncoming[1].title !== "Second") errors.push("merge both incoming");
    var idCalls = 0;
    var identical = mergePlans(
      [{ id: "a", title: "Keep", tag: "Trip", color: "#74a869", note: "n", start: "2026-03-01", end: "2026-03-02", images: [{ name: "m", src: "data:image/png;base64,aaa" }] }],
      [{ id: "a", title: "Keep", category: "Trip", color: "#74A869", note: " n ", start: "2026-03-01", end: "2026-03-02" }],
      function () { idCalls += 1; return "nope"; }
    );
    if (identical.length !== 1 || identical[0].id !== "a" || idCalls !== 0) errors.push("merge identical");
    if (!identical[0].images || identical[0].images.length !== 1) errors.push("merge identical images");
    var byNote = mergePlans(
      [{ id: "a", title: "Keep", tag: "Trip", color: "#74a869", note: "n", start: "2026-03-01", end: "2026-03-02" }],
      [{ id: "a", title: "Keep", tag: "Trip", color: "#74a869", note: "m", start: "2026-03-01", end: "2026-03-02" }],
      function () { return "note-copy"; }
    );
    if (byNote.length !== 2 || byNote[1].id !== "note-copy" || byNote[1].note !== "m") errors.push("merge note differs");
    var source = [
      { id: "a", title: "Keep", tag: "Trip", color: "#74a869", note: "", start: "2026-01-01", end: "2026-01-02" },
      { id: "b", title: "Other", tag: "Trip", color: "#37a388", note: "x", start: "2026-02-01", end: "2026-02-03" }
    ];
    var once = mergePlans([], source, function () { return "x"; });
    var twice = mergePlans(once, source, function () { return "y"; });
    if (twice.length !== 2 || twice[0].id !== "a" || twice[1].id !== "b") errors.push("merge reimport");
    var mixed = layout([
      { id: "span", title: "Span", start: "2026-05-01", end: "2026-05-10" },
      { id: "one", title: "One", start: "2026-05-04", end: "2026-05-04" },
      { id: "two", title: "Two", start: "2026-05-04", end: "2026-05-04" }
    ], "2026-05-01", "2026-05-31");
    if (mixed.lanes["2026-05"] !== 1) errors.push("single lane " + mixed.lanes["2026-05"]);
    if (mixed.bars.length !== 1 || mixed.bars[0].planId !== "span") errors.push("single excluded from bars");
    if (!mixed.singles || mixed.singles.length !== 2) errors.push("singles missing");
    if (plural(0, "plan") !== "0 plans") errors.push("plural zero");
    if (plural(1, "plan") !== "1 plan") errors.push("plural one");
    if (plural(2, "plan") !== "2 plans") errors.push("plural many");
    if (plural(1, "match", "matches") !== "1 match") errors.push("plural irregular one");
    if (plural(2, "match", "matches") !== "2 matches") errors.push("plural irregular many");
    if (plural(1, "identical plan") !== "1 identical plan") errors.push("plural phrase one");
    if (plural(2, "identical plan") !== "2 identical plans") errors.push("plural phrase many");
    if (importStatus("merge", 1, 1, 0, 0, "plan") !== "Merged 1 plan.") errors.push("merged one");
    if (importStatus("merge", 0, 2, 0, 0, "plan") !== "Merged 0 plans.") errors.push("merged zero");
    if (importStatus("merge", 2, 3, 1, 0, "plan") !== "Merged 2 plans, skipped 1 identical plan.") {
      errors.push("merged identical " + importStatus("merge", 2, 3, 1, 0, "plan"));
    }
    if (importStatus("merge", 0, 2, 2, 0, "plan") !== "Merged 0 plans, skipped 2 identical plans.") {
      errors.push("merged identical many");
    }
    if (importStatus("replace", 0, 1, 0, 0, "event") !== "Imported 1 event.") errors.push("imported one");
    if (importStatus("replace", 0, 2, 0, 1, "event") !== "Imported 2 events, skipped 1 unreadable event.") {
      errors.push("imported unreadable");
    }
    if (importStatus("merge", 4, 5, 1, 2, "plan") !== "Merged 4 plans, skipped 1 identical plan, skipped 2 unreadable plans.") {
      errors.push("merged both skips");
    }
    if (!barKeepsDayCount(80, 80)) errors.push("bar count fits");
    if (!barKeepsDayCount(81, 80)) errors.push("bar count tolerance");
    if (barKeepsDayCount(90, 40)) errors.push("bar count drop");
    if (!barKeepsDayCount(40, 0)) errors.push("bar count unmeasured");
    if (singleMarkerReserve(0) !== 0) errors.push("marker reserve empty");
    if (singleMarkerReserve(1) !== 13) errors.push("marker reserve one");
    if (singleMarkerReserve(3) !== 31) errors.push("marker reserve three");
    if (singleMarkerReserve(8) !== 31) errors.push("marker reserve cap");
    var inkFg = "#fcfff4";
    var inkBg = "#000d04";
    var inkExtra = { raised: "#171f1a", muted: "#545754", sun: "#c0d1a4" };
    if (barInk("#74a869", inkFg, inkBg, inkExtra) !== "bg") errors.push("ink travel");
    if (barInk("#41a468", inkFg, inkBg, inkExtra) !== "fg") errors.push("ink accent");
    if (barInk("#c0d1a4", inkFg, inkBg, inkExtra) !== "bg") errors.push("ink personal");
    if (barInk("#f8fc31", inkFg, inkBg, inkExtra) !== "bg") errors.push("ink yellow");
    if (barInk("#74a869", inkFg, inkBg, { muted: "#545754", past: true }) !== "fg") errors.push("ink past");
    if (barInk("#f8fc31", inkFg, inkBg, { muted: "#545754", past: true }) !== "bg") errors.push("ink past yellow");
    if (barInk("nope", inkFg, inkBg) !== "fg") errors.push("ink bad");
    var below = placeNear(
      { left: 20, top: 40, bottom: 60 },
      { width: 120, height: 80 },
      { width: 800, height: 600 }
    );
    if (below.top !== 66 || below.left !== 20 || below.flipped) errors.push("place below");
    var flipped = placeNear(
      { left: 20, top: 520, bottom: 540 },
      { width: 120, height: 80 },
      { width: 800, height: 600 }
    );
    if (!flipped.flipped || flipped.top !== 434) errors.push("place flip " + flipped.top);
    var shifted = placeNear(
      { left: 900, top: 40, bottom: 60 },
      { width: 200, height: 40 },
      { width: 1000, height: 600 }
    );
    if (shifted.left !== 792 || shifted.top !== 66) errors.push("place shift " + shifted.left);
    var clamped = placeNear(
      { left: -40, top: 10, bottom: 30 },
      { width: 900, height: 700 },
      { width: 400, height: 300 }
    );
    if (clamped.left !== 8 || clamped.top !== 8) errors.push("place clamp");
    if (clamped.top + 700 > 300 - 8 && clamped.top !== 8) errors.push("place clamp top");
    var inset = placeNear(
      { left: 40, top: 10, right: 80, bottom: 30 },
      { width: 100, height: 40 },
      { width: 800, height: 600 },
      6,
      { top: 48, right: 8, bottom: 8, left: 8 }
    );
    if (inset.top !== 48 || inset.flipped || inset.left !== 40) errors.push("place inset " + inset.top);
    if (Math.abs(inset.arrow - 20) > 0.01) errors.push("place arrow " + inset.arrow);
    var away = monthAwayDetail([
      { id: "nish", title: "Nish Canada", color: "#74a869", start: "2026-11-17", end: "2026-11-24" },
      { id: "game", title: "soccer game", color: "#37a388", start: "2026-11-03", end: "2026-11-03" },
      { id: "cross", title: "Bridge", color: "#54bda1", start: "2026-10-30", end: "2026-11-02" },
      { id: "later", title: "December", color: "#c0d1a4", start: "2026-12-01", end: "2026-12-02" }
    ], 2026, 11);
    if (away.label !== "November 2026") errors.push("away label");
    if (away.days !== 10) errors.push("away unique " + away.days);
    if (away.plans.length !== 2) errors.push("away count " + away.plans.length);
    if (away.plans[0].id !== "cross" || away.plans[0].start !== "2026-11-01" || away.plans[0].end !== "2026-11-02" || away.plans[0].days !== 2) {
      errors.push("away clip");
    }
    if (away.plans[1].id !== "nish" || away.plans[1].days !== 8 || away.plans[1].start !== "2026-11-17") errors.push("away inside");
    var typed = [
      { title: "Ski", start: "2026-03-01", end: "2026-03-03" },
      { title: "Dentist", start: "2026-03-04", end: "2026-03-04" },
      { title: "Day trip", start: "2026-03-10", end: "2026-03-10", type: "Trip" },
      { title: "Pack", start: "2026-03-06", end: "2026-03-08", type: "Reminder" }
    ];
    if (countTrips(typed) !== 2) errors.push("trip count " + countTrips(typed));
    if (daysAway(typed, 2026) !== 4) errors.push("trip days " + daysAway(typed, 2026));
    if (monthDaysAway(typed, 2026, 3) !== 4) errors.push("trip month " + monthDaysAway(typed, 2026, 3));
    var march = monthAwayDetail(typed, 2026, 3);
    if (march.plans.length !== 2 || march.plans[0].title !== "Ski" || march.plans[1].title !== "Day trip") {
      errors.push("trip detail");
    }
    var old = normalize({ title: "Old", start: "2026-06-02", end: "2026-06-01", tag: "" });
    if (!old || old.end !== "2026-06-02" || old.start !== "2026-06-02") errors.push("end before start");
    if (old.type) errors.push("old type stored");
    if (old.tag === "Plan") errors.push("default tag");
    if (planType(old) !== "Event") errors.push("infer event");
    var oldTrip = normalize({ title: "Old trip", start: "2026-06-01", end: "2026-06-04" });
    if (oldTrip.type) errors.push("old trip type stored");
    if (planType(oldTrip) !== "Trip") errors.push("infer trip");
    if (filterPlans([old], "2026-01-01", "2026-12-31", "all", "plan").length !== 0) errors.push("search plan");
    var listed = normalize({
      title: "Pack",
      start: "2026-07-01",
      end: "2026-07-02",
      type: "Trip",
      checklist: [
        { id: "a", text: "Passport", done: true },
        { text: "  ", done: false },
        { id: "b", text: "Socks", done: false }
      ]
    });
    if (!listed || listed.type !== "Trip" || !listed.checklist || listed.checklist.length !== 2) errors.push("checklist keep");
    var progress = checklistProgress(listed);
    if (!progress || progress.done !== 1 || progress.total !== 2) errors.push("checklist progress");
    if (checklistProgress(old)) errors.push("checklist empty");
    var renamed = makePlan({ title: "A", start: "2026-01-01", end: "2026-01-03", type: "Trip" }, { title: "B" });
    if (!renamed || renamed.title !== "B" || renamed.start !== "2026-01-01" || planType(renamed) !== "Trip") {
      errors.push("makePlan");
    }
    var longTitle = "";
    var longNote = "";
    for (var i = 0; i < 250; i++) longTitle += "t";
    for (var j = 0; j < 5200; j++) longNote += "n";
    var capped = normalize({ title: longTitle, note: longNote, start: "2026-08-01", end: "2026-08-01" });
    if (!capped || capped.title.length !== 200 || capped.note.length !== 5000) errors.push("length caps");
    if (backupTooLarge(20 * 1024 * 1024)) errors.push("20mb allowed");
    if (!backupTooLarge(20 * 1024 * 1024 + 1)) errors.push("20mb rejected");
    var none = monthAwayDetail([], 2026, 2);
    if (none.days !== 0 || none.plans.length !== 0 || none.label !== "February 2026") errors.push("away empty");
    var swatches = ["#74a869", "#37a388", "#c0d1a4", "#54bda1"];
    if (nearestSwatch("#37a388", swatches) !== "#37a388") errors.push("swatch exact");
    if (nearestSwatch("#36a287", swatches) !== "#37a388") errors.push("swatch near");
    var dirty = gcalPlain("Cafe\n<img src=x onerror=alert(1)>Hello <b>there</b><script>alert(1)</script> &amp; go");
    if (dirty !== "Cafe\nHello there & go") errors.push("gcal plain " + JSON.stringify(dirty));
    var calendar = { id: "primary", backgroundColor: "#74a869" };
    var flight = {
      id: "e1",
      etag: "\"w\"",
      status: "confirmed",
      summary: "<b>Flight</b>",
      location: "SFO",
      description: "<p>Gate 12</p>",
      htmlLink: "https://www.google.com/calendar/event?eid=abc",
      eventType: "fromGmail",
      start: { dateTime: "2026-07-01T09:00:00-07:00" },
      end: { dateTime: "2026-07-01T11:00:00-07:00" }
    };
    var mapped = gcalEventToPlan(flight, calendar);
    if (!mapped || mapped.type !== "Event" || mapped.title !== "Flight" || mapped.tag !== "Gmail") errors.push("gcal event");
    if (!mapped || mapped.note !== "SFO\nGate 12" || mapped.source !== "gcal" || mapped.gcalId !== "primary:e1") errors.push("gcal note");
    if (!mapped || mapped.time !== "9:00" || mapped.endTime !== "11:00" || mapped.location !== "SFO") errors.push("gcal when");
    var allDayIcs = icsBounds({ start: "2026-11-03", end: "2026-11-03" });
    if (allDayIcs.start !== "DTSTART;VALUE=DATE:20261103" || allDayIcs.end !== "DTEND;VALUE=DATE:20261104") {
      errors.push("ics allday");
    }
    var timedIcs = icsBounds({ start: "2026-11-03", end: "2026-11-03", time: "9:00", endTime: "11:00" });
    if (timedIcs.start !== "DTSTART:20261103T090000" || timedIcs.end !== "DTEND:20261103T110000") errors.push("ics timed");
    var readTimed = readIcsSpan(timedIcs.start, timedIcs.end);
    if (!readTimed || readTimed.time !== "9:00" || readTimed.endTime !== "11:00" || readTimed.end !== "2026-11-03") {
      errors.push("ics read timed");
    }
    var readDay = readIcsSpan(allDayIcs.start, allDayIcs.end);
    if (!readDay || readDay.start !== "2026-11-03" || readDay.end !== "2026-11-03" || readDay.time) errors.push("ics read day");
    if (clockText("09:00") !== "9:00" || clockText("25:00")) errors.push("clock");
    if (!mapped || mapped.htmlLink.indexOf("https://www.google.com/calendar/") !== 0) errors.push("gcal link");
    var week = gcalEventToPlan({
      id: "trip",
      status: "confirmed",
      summary: "Coast",
      start: { date: "2026-06-01" },
      end: { date: "2026-06-05" }
    }, calendar);
    if (!week || week.type !== "Trip" || week.start !== "2026-06-01" || week.end !== "2026-06-04") errors.push("gcal trip");
    var oneDay = gcalEventToPlan({
      id: "day",
      status: "confirmed",
      summary: "Holiday",
      start: { date: "2026-06-01" },
      end: { date: "2026-06-02" }
    }, calendar);
    if (!oneDay || oneDay.type !== "Event" || oneDay.start !== oneDay.end) errors.push("gcal allday");
    if (oneDay && oneDay.time) errors.push("gcal allday time");
    var span = gcalEventToPlan({
      id: "span",
      status: "confirmed",
      summary: "Drive",
      start: { dateTime: "2026-08-01T10:00:00-07:00" },
      end: { dateTime: "2026-08-03T10:00:00-07:00" }
    }, calendar);
    if (!span || span.type !== "Trip" || span.end !== "2026-08-03") errors.push("gcal multiday");
    var unsafe = gcalEventToPlan({
      id: "bad",
      status: "confirmed",
      summary: "Nope",
      htmlLink: "javascript:alert(1)",
      start: { date: "2026-06-01" },
      end: { date: "2026-06-02" }
    }, calendar);
    if (!unsafe || unsafe.htmlLink) errors.push("gcal unsafe link");
    var local = { id: "local", title: "Stay", tag: "Trip", color: "#74a869", start: "2026-07-02", end: "2026-07-04" };
    var first = applyGcalChanges([local], [flight], calendar);
    var second = applyGcalChanges(first.plans, [flight], calendar);
    if (first.plans.length !== 2 || second.plans.length !== 2 || second.upserted !== 1) errors.push("gcal dupe");
    if (second.plans[1].id !== first.plans[1].id) errors.push("gcal stable id");
    var renamedEvent = applyGcalChanges(second.plans, [{
      id: "e1",
      status: "confirmed",
      summary: "Flight home",
      start: flight.start,
      end: flight.end
    }], calendar);
    if (renamedEvent.plans.length !== 2 || renamedEvent.plans[1].title !== "Flight home" || renamedEvent.plans[1].id !== first.plans[1].id) {
      errors.push("gcal upsert");
    }
    var cleared = applyGcalChanges(renamedEvent.plans, [{ id: "e1", status: "cancelled" }], calendar);
    if (cleared.removed !== 1 || cleared.plans.length !== 1 || cleared.plans[0].id !== "local") errors.push("gcal cancel");
    var missing = applyGcalChanges(cleared.plans, [{ id: "nope", status: "cancelled" }], calendar);
    if (missing.removed !== 0 || missing.plans.length !== 1) errors.push("gcal cancel miss");
    var kept = makePlan({
      title: "A",
      start: "2026-01-01",
      end: "2026-01-01",
      source: "gcal",
      gcalId: "primary:e1",
      etag: "w",
      htmlLink: "https://www.google.com/calendar/event?eid=abc",
      gcalCal: "primary"
    }, { title: "B" });
    if (!kept || kept.title !== "B" || kept.source !== "gcal" || kept.gcalId !== "primary:e1" || kept.gcalCal !== "primary") {
      errors.push("gcal keep");
    }
    if (gcalSyncedCaption(0, 1000) !== "Not synced yet") errors.push("gcal caption empty");
    if (gcalSyncedCaption(80000, 200000) !== "Synced 2 min ago") errors.push("gcal caption");
    if (gcalSyncedCaption(200000, 200000) !== "Synced just now") errors.push("gcal caption now");
    if (!gcalNeedsFullSync(410) || gcalNeedsFullSync(200)) errors.push("gcal 410");
    if (!gcalTokenRejected(401) || gcalTokenRejected(200)) errors.push("gcal 401");
    return errors;
  }

  return {
    LETTERS: LETTERS,
    MONTHS: MONTHS,
    SAMPLE: SAMPLE,
    pad: pad,
    parse: parse,
    utc: utc,
    isoFromUTC: isoFromUTC,
    addDays: addDays,
    diffDays: diffDays,
    inclusiveDays: inclusiveDays,
    prettyDate: prettyDate,
    plural: plural,
    barKeepsDayCount: barKeepsDayCount,
    barInk: barInk,
    importStatus: importStatus,
    rangeCountLabel: rangeCountLabel,
    browseSpan: browseSpan,
    rollingRange: rollingRange,
    yearNavEnds: yearNavEnds,
    plansOutsideRange: plansOutsideRange,
    mergePlans: mergePlans,
    isSingleDay: isSingleDay,
    planType: planType,
    isTrip: isTrip,
    countTrips: countTrips,
    checklistProgress: checklistProgress,
    makePlan: makePlan,
    icsBounds: icsBounds,
    readIcsSpan: readIcsSpan,
    backupTooLarge: backupTooLarge,
    singleMarkerReserve: singleMarkerReserve,
    placeNear: placeNear,
    dragPastThreshold: dragPastThreshold,
    planGesture: planGesture,
    moveCommit: moveCommit,
    dayChipStack: dayChipStack,
    chipUsesInitial: chipUsesInitial,
    chipInitial: chipInitial,
    pinButtonAction: pinButtonAction,
    selectionSpan: selectionSpan,
    extendSelection: extendSelection,
    nudgeSelection: nudgeSelection,
    awayToggle: awayToggle,
    labelSlot: labelSlot,
    wrapLabels: wrapLabels,
    planSpanPhrase: planSpanPhrase,
    planLengthPhrase: planLengthPhrase,
    planTimingPhrase: planTimingPhrase,
    daysInMonth: daysInMonth,
    weekday: weekday,
    weekdayLetter: weekdayLetter,
    easterSunday: easterSunday,
    observedDate: observedDate,
    holidaysForYear: holidaysForYear,
    overlapsYear: overlapsYear,
    overlapsRange: overlapsRange,
    daysAway: daysAway,
    monthsInRange: monthsInRange,
    segmentInMonth: segmentInMonth,
    monthDaysAway: monthDaysAway,
    monthAwayDetail: monthAwayDetail,
    layoutMonths: layoutMonths,
    segmentsFor: segmentsFor,
    layout: layout,
    filterPlans: filterPlans,
    normalize: normalize,
    nearestSwatch: nearestSwatch,
    gcalPlain: gcalPlain,
    gcalEventToPlan: gcalEventToPlan,
    applyGcalChanges: applyGcalChanges,
    gcalSyncedCaption: gcalSyncedCaption,
    gcalNeedsFullSync: gcalNeedsFullSync,
    gcalTokenRejected: gcalTokenRejected,
    selfCheck: selfCheck
  };
})();
