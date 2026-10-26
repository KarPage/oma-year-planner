/* Optional read-only Google Calendar. The sign-in script loads only after Connect.
   The access token stays in memory. Sync state lives in year-planner/gcal, not v1. */
var GCAL_KEY = "year-planner/gcal";
var GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
var GCAL_GAP = 2 * 60 * 1000;

var gcalAccess = "";
var gcalExpires = 0;
var gcalClient = null;
var gcalScript = null;
var gcalSyncing = false;
var gcalLastSync = 0;
var gcalPop = document.getElementById("gcal-pop");

function gcalConfigured() {
  return typeof GOOGLE_CLIENT_ID === "string" && GOOGLE_CLIENT_ID.trim() !== "";
}

function gcalTokenValid() {
  return !!gcalAccess && Date.now() < gcalExpires;
}

function gcalReadMeta() {
  try {
    var raw = JSON.parse(localStorage.getItem(GCAL_KEY) || "null");
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.calendars)) return null;
    return {
      email: String(raw.email || ""),
      syncedAt: +raw.syncedAt || 0,
      calendars: raw.calendars.filter(function (cal) {
        return cal && cal.id;
      }).map(function (cal) {
        return {
          id: String(cal.id),
          summary: String(cal.summary || cal.id),
          backgroundColor: String(cal.backgroundColor || ""),
          primary: !!cal.primary,
          selected: !!cal.selected,
          syncToken: String(cal.syncToken || "")
        };
      })
    };
  } catch (err) {
    return null;
  }
}

function gcalWriteMeta(meta) {
  try {
    if (!meta) {
      localStorage.removeItem(GCAL_KEY);
      return;
    }
    localStorage.setItem(GCAL_KEY, JSON.stringify({
      email: meta.email || "",
      syncedAt: meta.syncedAt || 0,
      calendars: (meta.calendars || []).map(function (cal) {
        return {
          id: cal.id,
          summary: cal.summary || "",
          backgroundColor: cal.backgroundColor || "",
          primary: !!cal.primary,
          selected: !!cal.selected,
          syncToken: cal.syncToken || ""
        };
      })
    }));
  } catch (err) { /* private mode */ }
}

function gcalRestoreMeta(meta) {
  gcalWriteMeta(meta);
  paintGcal();
}

function gcalAccountEmail(calendars) {
  var primary = null;
  (calendars || []).forEach(function (cal) {
    if (cal.primary) primary = cal;
  });
  if (!primary) return "";
  if (primary.id && primary.id.indexOf("@") !== -1) return primary.id;
  return primary.summary || "";
}

function gcalPalette() {
  var names = ["--teal", "--sky", "--lavender", "--sand", "--rose", "--mint"];
  var list = [];
  names.forEach(function (name) {
    var value = "";
    try {
      value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    } catch (err) {
      value = "";
    }
    if (/^#[0-9a-fA-F]{6}$/.test(value)) list.push(value.toLowerCase());
  });
  return list;
}

function gcalLoadScript() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (gcalScript) return gcalScript;
  gcalScript = new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = function () { resolve(); };
    script.onerror = function () {
      gcalScript = null;
      reject(new Error("gis"));
    };
    document.head.appendChild(script);
  });
  return gcalScript;
}

function gcalEnsureClient() {
  return gcalLoadScript().then(function () {
    if (gcalClient) return gcalClient;
    gcalClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID.trim(),
      scope: GCAL_SCOPE,
      callback: gcalOnToken,
      error_callback: function () {
        gcalSyncing = false;
        paintGcal();
        if (!gcalTokenValid()) setStatus("Google Calendar was not connected.");
      }
    });
    return gcalClient;
  });
}

function gcalOnToken(response) {
  if (!response || response.error || !response.access_token) {
    gcalSyncing = false;
    paintGcal();
    setStatus("Google Calendar was not connected.");
    return;
  }
  gcalAccess = response.access_token;
  var seconds = +response.expires_in || 3600;
  gcalExpires = Date.now() + Math.max(30, seconds - 60) * 1000;
  gcalMaybeSync(true, true);
}

function gcalConnect() {
  if (!gcalConfigured()) return;
  gcalEnsureClient().then(function (client) {
    client.requestAccessToken();
  }).catch(function () {
    setStatus("Couldn't reach Google.");
  });
}

function gcalApi(path) {
  return fetch("https://www.googleapis.com/calendar/v3" + path, {
    headers: { Authorization: "Bearer " + gcalAccess }
  }).then(function (res) {
    if (Planner.gcalTokenRejected(res.status) || Planner.gcalNeedsFullSync(res.status) || !res.ok) {
      var err = new Error("gcal " + res.status);
      err.code = res.status;
      throw err;
    }
    return res.json();
  });
}

function gcalFetchCalendars() {
  var items = [];
  function page(token) {
    var path = "/users/me/calendarList?maxResults=250";
    if (token) path += "&pageToken=" + encodeURIComponent(token);
    return gcalApi(path).then(function (data) {
      items = items.concat(data.items || []);
      if (data.nextPageToken) return page(data.nextPageToken);
      return items.map(function (item) {
        return {
          id: item.id,
          summary: item.summary || item.id,
          backgroundColor: item.backgroundColor || "",
          primary: !!item.primary
        };
      });
    });
  }
  return page("");
}

function gcalBoardWindow() {
  var startYear = RANGE_START || new Date().getFullYear();
  var endYear = RANGE_END || startYear + 1;
  return {
    timeMin: startYear + "-01-01T00:00:00Z",
    timeMax: (endYear + 1) + "-01-01T00:00:00Z"
  };
}

function gcalListEvents(calendar, full) {
  var items = [];
  var syncToken = full ? "" : (calendar.syncToken || "");
  var range = gcalBoardWindow();
  function page(pageToken, pagesLeft) {
    var params = ["singleEvents=true", "showDeleted=true", "maxResults=250"];
    if (syncToken) params.push("syncToken=" + encodeURIComponent(syncToken));
    else {
      params.push("timeMin=" + encodeURIComponent(range.timeMin));
      params.push("timeMax=" + encodeURIComponent(range.timeMax));
    }
    if (pageToken) params.push("pageToken=" + encodeURIComponent(pageToken));
    var path = "/calendars/" + encodeURIComponent(calendar.id) + "/events?" + params.join("&");
    return gcalApi(path).then(function (data) {
      items = items.concat(data.items || []);
      if (data.nextPageToken && pagesLeft > 0) return page(data.nextPageToken, pagesLeft - 1);
      var finished = !data.nextPageToken;
      return { items: items, nextSyncToken: finished ? (data.nextSyncToken || "") : "" };
    });
  }
  return page("", 40).catch(function (err) {
    if (Planner.gcalNeedsFullSync(err.code) && !full) {
      calendar.syncToken = "";
      return gcalListEvents(calendar, true);
    }
    throw err;
  });
}

function gcalMergeCalendars(previous, incoming) {
  var selected = {};
  var tokens = {};
  var known = false;
  (previous.calendars || []).forEach(function (cal) {
    known = true;
    selected[cal.id] = !!cal.selected;
    tokens[cal.id] = cal.syncToken || "";
  });
  var calendars = incoming.map(function (cal) {
    var seen = Object.prototype.hasOwnProperty.call(selected, cal.id);
    return {
      id: cal.id,
      summary: cal.summary || cal.id,
      backgroundColor: cal.backgroundColor || "",
      primary: !!cal.primary,
      selected: seen ? selected[cal.id] : (!known && !!cal.primary),
      syncToken: tokens[cal.id] || ""
    };
  });
  return {
    email: gcalAccountEmail(calendars) || (previous && previous.email) || "",
    syncedAt: previous && previous.syncedAt || 0,
    calendars: calendars
  };
}

function gcalStamp(list) {
  return (list || []).map(function (plan) {
    return [
      plan.id, plan.source || "", plan.gcalId || "", plan.etag || "",
      plan.title, plan.start, plan.end, plan.note || "", plan.color || "",
      plan.type || "", plan.tag || ""
    ].join("\u0001");
  }).join("\u0002");
}

function gcalApply(meta, announce) {
  var palette = gcalPalette();
  var draft = plans.slice();
  var selected = {};
  meta.calendars.forEach(function (cal) {
    if (cal.selected) selected[cal.id] = true;
  });
  var chain = Promise.resolve();
  meta.calendars.forEach(function (cal) {
    if (!cal.selected) return;
    chain = chain.then(function () {
      return gcalListEvents(cal, !cal.syncToken).then(function (result) {
        var applied = Planner.applyGcalChanges(draft, result.items, cal, palette);
        draft = applied.plans;
        cal.syncToken = result.nextSyncToken || "";
      });
    });
  });
  return chain.then(function () {
    draft = draft.filter(function (plan) {
      if (plan.source !== "gcal") return true;
      return !!selected[plan.gcalCal];
    });
    meta.email = gcalAccountEmail(meta.calendars);
    meta.syncedAt = Date.now();
    gcalWriteMeta(meta);
    gcalLastSync = Date.now();
    if (gcalStamp(draft) === gcalStamp(plans)) {
      if (announce) setStatus("Google Calendar is up to date.");
      paintGcal();
      return;
    }
    commitEdit(function () {
      plans = draft;
    }, function () {
      if (announce) setStatus("Synced Google Calendar.");
    });
  });
}

function gcalMaybeSync(force, announce) {
  if (!gcalConfigured() || gcalSyncing) return;
  if (!gcalTokenValid()) {
    gcalAccess = "";
    paintGcal();
    return;
  }
  if (!force && Date.now() - gcalLastSync < GCAL_GAP) return;
  var meta = gcalReadMeta() || { email: "", syncedAt: 0, calendars: [] };
  gcalSyncing = true;
  gcalLastSync = Date.now();
  paintGcal();
  gcalFetchCalendars().then(function (incoming) {
    meta = gcalMergeCalendars(meta, incoming);
    return gcalApply(meta, announce);
  }).catch(function (err) {
    if (Planner.gcalTokenRejected(err && err.code)) {
      gcalAccess = "";
      gcalExpires = 0;
      setStatus("Reconnect Google to keep syncing.");
      return;
    }
    setStatus("Couldn't sync Google Calendar.");
  }).then(function () {
    gcalSyncing = false;
    paintGcal();
  });
}

function gcalRememberMeta(meta) {
  if (undoStack.length) undoStack[undoStack.length - 1].gcalMeta = meta;
}

function gcalSetCalendar(id, selected) {
  var before = gcalReadMeta();
  if (!before) return;
  var after = gcalMergeCalendars(before, before.calendars);
  after.calendars.forEach(function (cal) {
    if (cal.id === id) cal.selected = selected;
  });
  if (!selected) {
    commitEdit(function () {
      plans = plans.filter(function (plan) {
        return !(plan.source === "gcal" && plan.gcalCal === id);
      });
    }, function () {
      gcalRememberMeta(before);
      gcalWriteMeta(after);
      setStatus(selected ? "Showing that calendar." : "Hid that calendar.");
      paintGcal();
    });
    return;
  }
  gcalWriteMeta(after);
  paintGcal();
  if (gcalTokenValid()) gcalMaybeSync(true, true);
  else setStatus("Reconnect Google to sync that calendar.");
}

function gcalDisconnect() {
  var before = gcalReadMeta();
  var token = gcalAccess;
  gcalAccess = "";
  gcalExpires = 0;
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    try { google.accounts.oauth2.revoke(token); } catch (err) { /* already gone */ }
  }
  closeGcalPop(false);
  var had = plans.some(function (plan) { return plan.source === "gcal"; });
  if (!had) {
    gcalWriteMeta(null);
    paintGcal();
    setStatus("Disconnected Google Calendar.");
    return;
  }
  commitEdit(function () {
    plans = plans.filter(function (plan) { return plan.source !== "gcal"; });
  }, function () {
    gcalRememberMeta(before);
    gcalWriteMeta(null);
    paintGcal();
    setStatus("Disconnected Google Calendar.");
  });
}

function paintGcal() {
  var connect = document.getElementById("gcal-connect");
  var reconnect = document.getElementById("gcal-reconnect");
  var tile = document.getElementById("gcal-tile");
  var email = document.getElementById("gcal-email");
  var caption = document.getElementById("gcal-caption");
  var dot = document.getElementById("gcal-dot");
  var cals = document.getElementById("gcal-cals");
  if (!tile || !connect || !reconnect) return;
  if (!gcalConfigured()) {
    connect.hidden = true;
    reconnect.hidden = true;
    tile.hidden = true;
    return;
  }
  var meta = gcalReadMeta();
  var connected = !!(meta && meta.calendars && meta.calendars.length);
  var live = gcalTokenValid();
  connect.hidden = connected;
  reconnect.hidden = !(connected && !live);
  tile.hidden = false;
  tile.classList.toggle("is-idle", !connected);
  tile.classList.toggle("is-live", connected && live && !gcalSyncing);
  tile.classList.toggle("is-wait", connected && !live && !gcalSyncing);
  dot.hidden = !connected;
  dot.classList.toggle("is-ok", connected && live && !gcalSyncing);
  dot.classList.toggle("is-wait", connected && !live && !gcalSyncing);
  dot.classList.toggle("is-sync", gcalSyncing);
  if (!connected) {
    email.textContent = "";
    email.removeAttribute("title");
    caption.textContent = "Connect Google";
    cals.hidden = true;
    cals.replaceChildren();
    tile.title = "Connect Google Calendar";
    return;
  }
  var address = meta.email || gcalAccountEmail(meta.calendars);
  email.textContent = address;
  email.title = address;
  caption.textContent = gcalSyncing
    ? "Syncing"
    : Planner.gcalSyncedCaption(meta.syncedAt, Date.now());
  var chosen = meta.calendars.filter(function (cal) { return cal.selected; });
  var names = chosen.map(function (cal) { return cal.summary || cal.id; });
  cals.hidden = false;
  cals.replaceChildren();
  cals.title = names.join(", ");
  chosen.forEach(function (cal) {
    var swatch = document.createElement("span");
    swatch.className = "gcal-cal";
    swatch.style.background = Planner.nearestSwatch(cal.backgroundColor, gcalPalette());
    cals.appendChild(swatch);
  });
  var count = document.createElement("span");
  count.className = "gcal-count";
  count.textContent = Planner.plural(chosen.length, "calendar");
  cals.appendChild(count);
  tile.title = (address ? address + ". " : "") + caption.textContent;
}

function gcalOnMinute() {
  if (gcalSyncing) return;
  var caption = document.getElementById("gcal-caption");
  var meta = gcalReadMeta();
  if (!caption || !meta || !meta.calendars || !meta.calendars.length) return;
  caption.textContent = Planner.gcalSyncedCaption(meta.syncedAt, Date.now());
}

function gcalOnBoot() {
  paintGcal();
  if (gcalTokenValid()) gcalMaybeSync(true, false);
}

function closeGcalPop(restore) {
  if (!gcalPop || gcalPop.hidden) return;
  gcalPop.hidden = true;
  gcalPop.replaceChildren();
  if (restore) {
    var tile = document.getElementById("gcal-tile");
    if (tile) focusNoScroll(tile);
  }
}

function placeGcalPop(anchor) {
  var box = anchor.getBoundingClientRect();
  var placed = placeElement(gcalPop, {
    left: box.left,
    top: box.top,
    bottom: box.bottom,
    fallbackWidth: 280,
    fallbackHeight: 180
  });
  gcalPop.classList.toggle("above", placed.flipped);
  var width = gcalPop.getBoundingClientRect().width || 280;
  var arrow = box.left + (box.width / 2) - placed.left - 4;
  gcalPop.style.setProperty("--arrow", Math.max(12, Math.min(arrow, width - 20)) + "px");
  gcalPop.style.setProperty("--origin-y", placed.flipped ? "100%" : "0");
}

function openGcalPop(anchor) {
  var meta = gcalReadMeta();
  if (!gcalPop || !meta) return;
  closeQuickEdit(false);
  closeAwayPop(false);
  closeDayList();
  hideTip();
  gcalPop.hidden = false;
  gcalPop.replaceChildren();
  var title = document.createElement("p");
  title.className = "away-title";
  title.textContent = meta.email || "Google Calendar";
  gcalPop.appendChild(title);
  var note = document.createElement("p");
  note.className = "away-empty";
  note.textContent = "Read-only. Events come straight from Google to this browser.";
  gcalPop.appendChild(note);
  var list = document.createElement("div");
  list.className = "gcal-checks";
  meta.calendars.forEach(function (cal) {
    var label = document.createElement("label");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!cal.selected;
    var name = document.createElement("span");
    name.textContent = cal.summary || cal.id;
    label.append(box, name);
    box.addEventListener("change", function () {
      gcalSetCalendar(cal.id, box.checked);
    });
    list.appendChild(label);
  });
  gcalPop.appendChild(list);
  var actions = document.createElement("div");
  actions.className = "gcal-pop-actions";
  var syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.className = "ghost";
  syncBtn.textContent = "Sync now";
  syncBtn.addEventListener("click", function () {
    if (gcalTokenValid()) gcalMaybeSync(true, true);
    else gcalConnect();
  });
  var dropBtn = document.createElement("button");
  dropBtn.type = "button";
  dropBtn.className = "danger";
  dropBtn.textContent = "Disconnect";
  dropBtn.addEventListener("click", gcalDisconnect);
  actions.append(syncBtn, dropBtn);
  gcalPop.appendChild(actions);
  placeGcalPop(anchor);
  focusNoScroll(gcalPop);
}

document.getElementById("gcal-connect").addEventListener("click", gcalConnect);
document.getElementById("gcal-reconnect").addEventListener("click", gcalConnect);
document.getElementById("gcal-tile").addEventListener("click", function () {
  if (!gcalConfigured()) return;
  var meta = gcalReadMeta();
  if (!meta || !meta.calendars.length) {
    gcalConnect();
    return;
  }
  if (gcalPop && !gcalPop.hidden) closeGcalPop(false);
  else openGcalPop(document.getElementById("gcal-tile"));
});
document.getElementById("gcal-dot").addEventListener("click", function (event) {
  if (!this.classList.contains("is-wait")) return;
  event.preventDefault();
  event.stopPropagation();
  gcalConnect();
});

document.addEventListener("pointerdown", function (event) {
  if (!gcalPop || gcalPop.hidden) return;
  if (gcalPop.contains(event.target)) return;
  if (event.target.closest && event.target.closest("#gcal-tile")) return;
  closeGcalPop(false);
});
document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape" || !gcalPop || gcalPop.hidden) return;
  event.preventDefault();
  event.stopPropagation();
  closeGcalPop(true);
}, true);
board.addEventListener("scroll", function () {
  closeGcalPop(false);
});
window.addEventListener("focus", function () {
  gcalMaybeSync(false, false);
});
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) gcalMaybeSync(false, false);
});

paintGcal();
