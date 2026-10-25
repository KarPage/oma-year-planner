/* Year-planner date math. Dates are YYYY-MM-DD calendar days, never timestamps. */
var Planner = (function () {
  var LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var CATEGORIES = ["travel", "work", "personal", "other"];

  var SAMPLE = [
    { id: "schladming", title: "Schladming Ski", tag: "Trip", color: "#74a869", start: "2026-01-02", end: "2026-01-08" },
    { id: "croatia-mar", title: "Croatia", tag: "Trip", color: "#74a869", start: "2026-03-10", end: "2026-03-16" },
    { id: "istria", title: "Istria / Wedding", tag: "Trip", color: "#74a869", start: "2026-04-24", end: "2026-04-27" },
    { id: "vienna-may", title: "Vienna", tag: "Trip", color: "#74a869", start: "2026-05-09", end: "2026-05-13" },
    { id: "zagreb", title: "Zagreb / Wedding", tag: "Trip", color: "#74a869", start: "2026-05-17", end: "2026-05-21" },
    { id: "vienna-jun", title: "Vienna", tag: "Trip", color: "#74a869", start: "2026-06-06", end: "2026-06-10" },
    { id: "croatia-jun", title: "Croatia", tag: "Trip", color: "#74a869", start: "2026-06-14", end: "2026-06-25" },
    { id: "red-bull", title: "Red Bull Ring", tag: "Trip", color: "#74a869", start: "2026-06-28", end: "2026-06-30" },
    { id: "berlin", title: "Berlin", tag: "Trip", color: "#74a869", start: "2026-07-14", end: "2026-07-19" },
    { id: "croatia-aug", title: "Croatia", tag: "Trip", color: "#74a869", start: "2026-08-05", end: "2026-08-11" },
    { id: "tuscany", title: "Tuscany", tag: "Trip", color: "#74a869", start: "2026-08-14", end: "2026-08-19" },
    { id: "st-moritz", title: "St Moritz", tag: "Trip", color: "#74a869", start: "2026-09-10", end: "2026-09-12" },
    { id: "portofino", title: "Portofino", tag: "Trip", color: "#74a869", start: "2026-09-14", end: "2026-09-17" },
    { id: "croatia-sep", title: "Croatia", tag: "Trip", color: "#74a869", start: "2026-09-20", end: "2026-09-25" },
    { id: "croatia-oct", title: "Croatia", tag: "Trip", color: "#74a869", start: "2026-10-17", end: "2026-10-23" },
    { id: "vienna-nov", title: "Vienna", tag: "Trip", color: "#74a869", start: "2026-11-07", end: "2026-11-10" }
  ];

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parse(iso) {
    var parts = String(iso).split("-");
    if (parts.length !== 3) return null;
    var y = +parts[0];
    var m = +parts[1];
    var d = +parts[2];
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
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

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function weekday(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function weekdayLetter(y, m, d) {
    return LETTERS[weekday(y, m, d)];
  }

  function compare(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function overlapsYear(plan, year) {
    var start = plan.start;
    var end = plan.end < plan.start ? plan.start : plan.end;
    var from = year + "-01-01";
    var to = year + "-12-31";
    return start <= to && end >= from;
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
    var lanes = Object.create(null);
    months.forEach(function (month) {
      var key = month.y + "-" + pad(month.m);
      var segs = [];
      plans.forEach(function (plan) {
        var seg = segmentInMonth(plan, month.y, month.m);
        if (seg) segs.push(seg);
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
    return { bars: bars, lanes: lanes };
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

  function layout(plans, year) {
    var byMonth = [];
    for (var m = 0; m < 12; m++) byMonth.push([]);
    plans.forEach(function (plan) {
      segmentsFor(plan, year).forEach(function (seg) {
        seg.plan = plan;
        byMonth[seg.month - 1].push(seg);
      });
    });
    var bars = [];
    var lanes = [];
    byMonth.forEach(function (segs) {
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
      lanes.push(laneEnds.length);
    });
    return { bars: bars, lanes: lanes };
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

  function filterPlans(plans, year, tag, query) {
    var q = String(query || "").trim().toLowerCase();
    return plans.filter(function (plan) {
      if (!overlapsYear(plan, year)) return false;
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
    if (SAMPLE.length !== 16) errors.push("sample count " + SAMPLE.length);
    var trips = SAMPLE.filter(function (p) { return p.tag === "Trip"; }).length;
    if (trips !== 16) errors.push("trips " + trips);
    var days = daysAway(SAMPLE, 2026);
    if (days !== 91) errors.push("days away " + days);
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
    ], 2026);
    var may = stacked.bars.filter(function (b) { return b.month === 5; });
    if (may.length !== 2 || may[0].lane === may[1].lane) errors.push("lanes");
    if (stacked.lanes[4] !== 2) errors.push("lane count");
    var away = daysAway([
      { id: "a", title: "A", tag: "Trip", color: "#74a869", start: "2026-06-28", end: "2026-07-02" },
      { id: "b", title: "B", tag: "Trip", color: "#74a869", start: "2026-07-02", end: "2026-07-03" }
    ], 2026);
    if (away !== 6) errors.push("unique days " + away);
    if (filterPlans(SAMPLE, 2026, "Work", "").length !== 0) errors.push("tag filter");
    if (filterPlans(SAMPLE, 2026, "Trip", "").length !== 16) errors.push("trip filter");
    if (filterPlans(SAMPLE, 2026, "all", "vienna").length !== 3) errors.push("search");
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
    return errors;
  }

  return {
    LETTERS: LETTERS,
    MONTHS: MONTHS,
    CATEGORIES: CATEGORIES,
    SAMPLE: SAMPLE,
    pad: pad,
    parse: parse,
    utc: utc,
    isoFromUTC: isoFromUTC,
    addDays: addDays,
    diffDays: diffDays,
    daysInMonth: daysInMonth,
    weekday: weekday,
    weekdayLetter: weekdayLetter,
    compare: compare,
    overlapsYear: overlapsYear,
    daysAway: daysAway,
    monthsInRange: monthsInRange,
    segmentInMonth: segmentInMonth,
    monthDaysAway: monthDaysAway,
    layoutMonths: layoutMonths,
    segmentsFor: segmentsFor,
    layout: layout,
    filterPlans: filterPlans,
    normalize: normalize,
    selfCheck: selfCheck
  };
})();
