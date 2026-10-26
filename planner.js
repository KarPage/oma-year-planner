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

  function rollingRange(today, plans) {
    var y = today && typeof today === "object" ? today.y : (parse(today) || {}).y;
    if (!y) y = new Date().getFullYear();
    var start = y;
    var end = y + 1;
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

  /* Room the multi-day bars leave for single-day pills.
     7px pill, 2px gap, 3px inset from the cell bottom, 3px clearance.
     At most three pills, then a +N. */
  function singleMarkerReserve(count) {
    var shown = Math.min(Math.max(0, count | 0), 3);
    if (!shown) return 0;
    return 3 + shown * 7 + (shown - 1) * 2 + 3;
  }

  /* Keep a popover fully inside the viewport. Prefer below the anchor,
     flip above when that would clip, then shift left or right. */
  function placeNear(anchor, size, view, gap, margin) {
    var g = gap == null ? 6 : gap;
    var edge = margin == null ? 8 : margin;
    var width = size.width;
    var height = size.height;
    var left = anchor.left;
    var top = anchor.bottom + g;
    var flipped = false;
    if (top + height > view.height - edge) {
      var above = anchor.top - height - g;
      if (above >= edge) {
        top = above;
        flipped = true;
      } else {
        top = view.height - edge - height;
      }
    }
    if (top < edge) top = edge;
    if (top + height > view.height - edge) top = Math.max(edge, view.height - edge - height);
    if (left + width > view.width - edge) left = view.width - edge - width;
    if (left < edge) left = edge;
    return { left: left, top: top, flipped: flipped };
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
    plans.forEach(function (plan) {
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
      if (!plan || !parse(plan.start) || !parse(plan.end)) return;
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
    plans.forEach(function (plan) {
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
    if (!tag) tag = "Plan";
    if (!color) color = "#74a869";
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
    return {
      id: raw.id ? String(raw.id) : "",
      title: title.slice(0, 80),
      tag: tag.slice(0, 24),
      color: color,
      note: String(raw.note || "").trim().slice(0, 4000),
      images: images,
      start: startIso,
      end: endIso
    };
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
    if (rollingEmpty.start !== 2026 || rollingEmpty.end !== 2027) errors.push("rolling empty");
    var rollingInside = rollingRange({ y: 2026, m: 6, d: 1 }, [
      { start: "2026-01-05", end: "2026-01-11" }
    ]);
    if (rollingInside.start !== 2026 || rollingInside.end !== 2027) errors.push("rolling inside");
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
    if (rollingTypo.start !== 2026 || rollingTypo.end !== 2027) errors.push("rolling typo");
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
    var away = monthAwayDetail([
      { id: "nish", title: "Nish Canada", color: "#74a869", start: "2026-11-17", end: "2026-11-24" },
      { id: "game", title: "soccer game", color: "#37a388", start: "2026-11-03", end: "2026-11-03" },
      { id: "cross", title: "Bridge", color: "#54bda1", start: "2026-10-30", end: "2026-11-02" },
      { id: "later", title: "December", color: "#c0d1a4", start: "2026-12-01", end: "2026-12-02" }
    ], 2026, 11);
    if (away.label !== "November 2026") errors.push("away label");
    if (away.days !== 11) errors.push("away unique " + away.days);
    if (away.plans.length !== 3) errors.push("away count");
    if (away.plans[0].id !== "cross" || away.plans[0].start !== "2026-11-01" || away.plans[0].end !== "2026-11-02" || away.plans[0].days !== 2) {
      errors.push("away clip");
    }
    if (away.plans[1].id !== "game" || away.plans[1].days !== 1) errors.push("away single");
    if (away.plans[2].id !== "nish" || away.plans[2].days !== 8 || away.plans[2].start !== "2026-11-17") errors.push("away inside");
    var none = monthAwayDetail([], 2026, 2);
    if (none.days !== 0 || none.plans.length !== 0 || none.label !== "February 2026") errors.push("away empty");
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
    importStatus: importStatus,
    rangeCountLabel: rangeCountLabel,
    rollingRange: rollingRange,
    plansOutsideRange: plansOutsideRange,
    mergePlans: mergePlans,
    isSingleDay: isSingleDay,
    singleMarkerReserve: singleMarkerReserve,
    placeNear: placeNear,
    daysInMonth: daysInMonth,
    weekday: weekday,
    weekdayLetter: weekdayLetter,
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
    selfCheck: selfCheck
  };
})();
