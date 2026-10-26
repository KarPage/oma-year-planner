/* Wires controls and starts the planner. */
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

var WELCOME_KEY = "year-planner/welcome";

function savedPlanCount() {
  try {
    var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && Array.isArray(raw.plans)) return raw.plans.length;
  } catch (err) { /* no saved plans yet */ }
  return 0;
}

function openHelp(mode) {
  var help = document.getElementById("help");
  var welcome = mode === "welcome";
  help.classList.toggle("is-welcome", welcome);
  var keysOpen = mode === "shortcuts";
  var boardKeys = document.getElementById("key-board");
  var keysBtn = document.getElementById("help-keys-btn");
  if (boardKeys) boardKeys.hidden = !keysOpen;
  if (keysBtn) keysBtn.setAttribute("aria-expanded", keysOpen ? "true" : "false");
  var again = document.getElementById("help-show-again");
  if (welcome && again) again.checked = false;
  if (!help.open) help.showModal();
}

document.getElementById("help").addEventListener("close", function () {
  var help = document.getElementById("help");
  if (!help.classList.contains("is-welcome")) return;
  var again = document.getElementById("help-show-again");
  if (again && again.checked) return;
  try { localStorage.setItem(WELCOME_KEY, "1"); } catch (err) { /* private mode */ }
});

document.getElementById("keys-btn").addEventListener("click", function () {
  openHelp("shortcuts");
});

var PIN_BRIDGE = "http://127.0.0.1:47321";
var pinBusy = false;

function showToast(text) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(function () { toast.hidden = true; }, 7000);
}

function paintPin(pinned) {
  var button = document.getElementById("pin-desk");
  var label = document.getElementById("pin-desk-label");
  if (!button || !label) return;
  label.textContent = pinned ? "Unpin" : "Pin to desktop";
  button.setAttribute("aria-pressed", pinned ? "true" : "false");
  button.title = pinned
    ? "Take the board off the desktop"
    : "Pin the year board to the desktop wallpaper";
}

function togglePin() {
  var button = document.getElementById("pin-desk");
  if (pinBusy) return;
  pinBusy = true;
  if (button) button.disabled = true;
  fetch(PIN_BRIDGE + "/toggle", { method: "POST" }).then(function (res) {
    if (!res.ok) throw new Error("pin");
    return res.json();
  }).then(function (data) {
    paintPin(!!data.pinned);
    if (data.pinned) {
      showToast("Pinned to your desktop. Press Super+Shift+Y or click the calendar icon in the top bar to unpin.");
    } else {
      showToast("Desktop wallpaper restored.");
    }
  }).catch(function () {
    showToast("Couldn't reach the desktop helper. Open the planner with ./open.");
  }).then(function () {
    pinBusy = false;
    if (button) button.disabled = false;
  });
}

document.getElementById("pin-desk").addEventListener("click", togglePin);

function fullscreenOn() {
  return !!document.fullscreenElement;
}

function paintFullscreen() {
  var on = fullscreenOn();
  var button = document.getElementById("full-btn");
  document.documentElement.classList.toggle("is-full", on);
  // Full screen from the browser or from the compositor: the window covers
  // the whole screen, so give the top row room to breathe.
  var edge = on || (window.innerWidth >= screen.width && window.innerHeight >= screen.height);
  document.documentElement.classList.toggle("is-edge", edge);
  if (!button) return;
  button.classList.toggle("is-full", on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  var label = on ? "Exit full screen (F)" : "Full screen (F)";
  button.title = label;
  button.setAttribute("aria-label", label);
}

function toggleFullscreen() {
  if (fullscreenOn()) {
    var leaving = document.exitFullscreen && document.exitFullscreen();
    if (leaving && leaving.catch) leaving.catch(function () {});
    return;
  }
  if (!document.documentElement.requestFullscreen) return;
  var entering = document.documentElement.requestFullscreen();
  if (entering && entering.catch) entering.catch(function () {});
}

document.getElementById("full-btn").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", paintFullscreen);
window.addEventListener("resize", paintFullscreen);
paintFullscreen();
fetch(PIN_BRIDGE + "/status").then(function (res) {
  if (!res.ok) throw new Error("status");
  return res.json();
}).then(function (data) {
  paintPin(!!data.pinned);
}).catch(function () {});
document.getElementById("help-keys-btn").addEventListener("click", function () {
  var boardKeys = document.getElementById("key-board");
  var open = boardKeys.hidden;
  boardKeys.hidden = !open;
  this.setAttribute("aria-expanded", open ? "true" : "false");
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

document.getElementById("rhythm").addEventListener("click", function (event) {
  var button = event.target.closest && event.target.closest(".dash-event");
  if (!button) return;
  var which = button.dataset.which;
  var plan = which === "last" ? rhythmLast : (which === "up" ? rhythmUp : rhythmNext);
  if (plan) focusPlan(plan);
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

function exportPlans(withImages) {
  var list = plans.map(function (plan) {
    var copy = storedPlan(plan);
    if (withImages && plan.images && plan.images.length) copy.images = plan.images;
    return copy;
  });
  var blob = new Blob([JSON.stringify({ version: 1, plans: list }, null, 2) + "\n"], {
    type: "application/json"
  });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = "year-planner.json";
  link.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  setStatus("Exported " + Planner.plural(list.length, "plan") + (withImages ? " with images." : " without images."));
}

document.getElementById("export").addEventListener("click", function () {
  var chooser = document.getElementById("export-mode");
  if (!chooser || typeof chooser.showModal !== "function") {
    exportPlans(true);
    return;
  }
  chooser.returnValue = "";
  chooser.showModal();
  chooser.addEventListener("close", function onClose() {
    chooser.removeEventListener("close", onClose);
    if (chooser.returnValue === "without") exportPlans(false);
    else if (chooser.returnValue === "with") exportPlans(true);
  });
});

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
    refreshToday();
    if (typeof gcalOnMinute === "function") gcalOnMinute();
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
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.register("sw.js").catch(function () {});
    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    }
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
  if (y === today.y) centerOnToday(false);
  else scrollToMonth(y, m, false);
  updateViewYear();
  armClock();
  var versionNode = document.getElementById("app-version");
  if (versionNode && window.VERSION) versionNode.textContent = "v" + window.VERSION;
  try {
    if (!savedPlanCount() && localStorage.getItem(WELCOME_KEY) !== "1") openHelp("welcome");
  } catch (err) { /* private mode */ }
  if (typeof gcalOnBoot === "function") gcalOnBoot();
}
hydrateImages().then(boot, boot);
setTimeout(boot, 800);
var resizeTick = 0;
window.addEventListener("resize", function () {
  if (resizeTick) cancelAnimationFrame(resizeTick);
  resizeTick = requestAnimationFrame(function () {
    resizeTick = 0;
    applySnapPadding();
    fitMarquee();
    fitBarLabels();
    if (boardDrag) return;
    if (board.classList.contains("today-view")) {
      centerOnToday(false);
      return;
    }
    var months = board.querySelectorAll(".month");
    if (!months.length) return;
    var index = monthAtTopIndex();
    var parts = months[index].dataset.ym.split("-");
    scrollToMonth(+parts[0], +parts[1], false);
  });
});
if (window.matchMedia) {
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function () {
      fitMarquee();
      fitBarLabels();
    });
  }
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () {
    fitBarLabels();
    fitMarquee();
  }).catch(function () {});
}

window.addEventListener("pointermove", onArmMove);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerCancel);
