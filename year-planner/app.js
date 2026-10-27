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
var BRIDGE_TOKEN_KEY = "year-planner/bridge-token";

// ./open passes the desktop helper's secret in the URL fragment (#bt=...).
// Keep it for this tab only, then take it out of the address.
var bridgeToken = (function () {
  var token = "";
  var match = /(?:^#|&)bt=([0-9a-f]{64})(?:&|$)/.exec(location.hash || "");
  if (match) {
    token = match[1];
    try { sessionStorage.setItem(BRIDGE_TOKEN_KEY, token); } catch (err) { /* private mode */ }
    var rest = location.hash.replace(/(^#|&)bt=[0-9a-f]{64}/, "$1").replace(/^#&/, "#").replace(/&$/, "");
    try {
      history.replaceState(history.state, "", location.pathname + location.search + (rest === "#" ? "" : rest));
    } catch (err) { /* ignore */ }
  } else {
    try { token = sessionStorage.getItem(BRIDGE_TOKEN_KEY) || ""; } catch (err) { token = ""; }
  }
  return token;
})();

function bridgeFetch(path, method) {
  if (!bridgeToken) return Promise.reject(new Error("no-token"));
  return fetch(PIN_BRIDGE + path, {
    method: method || "GET",
    cache: "no-store",
    headers: { "X-Planner-Token": bridgeToken }
  });
}

var PIN_HINT = "Pin to desktop needs the desktop helper. Open the planner from the bar menu or ./open.";

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
  var text = pinned ? "Unpin from desktop" : "Pin to desktop";
  label.textContent = text;
  button.setAttribute("aria-label", text);
  button.setAttribute("aria-pressed", pinned ? "true" : "false");
  button.title = bridgeToken ? text : PIN_HINT;
}

function togglePin() {
  if (typeof closePinConfirm === "function") closePinConfirm();
  var button = document.getElementById("pin-desk");
  if (pinBusy) return;
  pinBusy = true;
  if (button) button.disabled = true;
  var label = document.getElementById("pin-desk-label");
  var busy = button && button.getAttribute("aria-pressed") === "true" ? "Unpinning\u2026" : "Pinning\u2026";
  if (label) label.textContent = busy;
  if (button) button.setAttribute("aria-label", busy);
  bridgeFetch("/toggle", "POST").then(function (res) {
    if (res.status === 403) throw new Error("no-token");
    if (!res.ok) throw new Error("pin");
    return res.json();
  }).then(function (data) {
    paintPin(!!data.pinned);
    if (data.pinned) {
      showToast("Pinned to your desktop. Press Super+Shift+Y or click the calendar icon in the top bar to unpin.");
    } else {
      showToast("Desktop wallpaper restored.");
    }
  }).catch(function (err) {
    paintPin(button && button.getAttribute("aria-pressed") === "true");
    if (err && err.message === "no-token") showToast(PIN_HINT);
    else showToast("Couldn't reach the desktop helper. Open the planner with ./open.");
  }).then(function () {
    pinBusy = false;
    if (button) button.disabled = false;
  });
}

var PIN_CONFIRM_KEY = "year-planner/pin-confirm";

function pinConfirmSkipped() {
  try { return localStorage.getItem(PIN_CONFIRM_KEY) === "skip"; } catch (err) { return false; }
}

function closePinConfirm() {
  var pop = document.getElementById("pin-confirm");
  var button = document.getElementById("pin-desk");
  if (pop) pop.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function placePinConfirm() {
  var pop = document.getElementById("pin-confirm");
  var button = document.getElementById("pin-desk");
  if (!pop || pop.hidden || !button || typeof placeElement !== "function") return;
  var box = button.getBoundingClientRect();
  var placed = placeElement(pop, {
    left: box.left,
    right: box.right,
    top: box.top,
    bottom: box.bottom,
    gap: 8,
    fallbackWidth: 300,
    fallbackHeight: 180
  });
  pop.classList.toggle("above", !!(placed && placed.flipped));
  if (placed && placed.arrow != null) pop.style.setProperty("--arrow", Math.max(10, placed.arrow - 4) + "px");
}

function openPinConfirm() {
  var pop = document.getElementById("pin-confirm");
  var button = document.getElementById("pin-desk");
  if (!pop || !button) return;
  var pinned = button.getAttribute("aria-pressed") === "true";
  var action = Planner.pinButtonAction(false, pinned);
  document.getElementById("pin-confirm-title").textContent = action === "ask-unpin" ? "Unpin from desktop" : "Pin to desktop";
  document.getElementById("pin-confirm-body").textContent = action === "ask-unpin"
    ? "Puts your previous wallpaper back. The midnight repaint stops until you pin the planner again."
    : "A still picture of this planner becomes your desktop wallpaper, behind your windows. Nothing on the picture clicks. It is painted again at midnight, and again when this window closes.";
  document.getElementById("pin-confirm-how").textContent = "Unpin anytime from this button, the bar menu (W), or a right-click on the bar icon.";
  document.getElementById("pin-confirm-go").textContent = action === "ask-unpin" ? "Unpin from desktop" : "Pin to desktop";
  document.getElementById("pin-confirm-skip").checked = false;
  pop.hidden = false;
  button.setAttribute("aria-expanded", "true");
  placePinConfirm();
  document.getElementById("pin-confirm-go").focus();
}

function onPinButtonClick() {
  var pop = document.getElementById("pin-confirm");
  if (pop && !pop.hidden) {
    closePinConfirm();
    return;
  }
  var button = document.getElementById("pin-desk");
  var pinned = !!(button && button.getAttribute("aria-pressed") === "true");
  var action = Planner.pinButtonAction(pinConfirmSkipped(), pinned);
  if (action === "pin" || action === "unpin") {
    togglePin();
    return;
  }
  openPinConfirm();
}

document.getElementById("pin-desk").addEventListener("click", onPinButtonClick);
document.getElementById("pin-confirm-cancel").addEventListener("click", closePinConfirm);
document.getElementById("pin-confirm-go").addEventListener("click", function () {
  if (document.getElementById("pin-confirm-skip").checked) {
    try { localStorage.setItem(PIN_CONFIRM_KEY, "skip"); } catch (err) { /* private mode */ }
  }
  closePinConfirm();
  togglePin();
});
window.addEventListener("resize", function () {
  if (typeof placePinConfirm === "function") placePinConfirm();
});
if (!bridgeToken && !window.OMA_WALLPAPER) paintPin(false);

var wmFullscreen = false;
var fsPollTimer = 0;

function displayModeFullscreen() {
  try { return window.matchMedia("(display-mode: fullscreen)").matches; } catch (err) { return false; }
}

function fullscreenOn() {
  return !!(document.fullscreenElement || wmFullscreen || displayModeFullscreen());
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

function burstFullscreen() {
  [200, 600, 1200].forEach(function (ms) { setTimeout(checkPin, ms); });
}

function bridgeFullscreen() {
  if (window.OMA_WALLPAPER || !bridgeToken) {
    paintFullscreen();
    return;
  }
  bridgeFetch("/fullscreen", "POST").then(function (res) {
    if (!res.ok) throw new Error("fullscreen");
    return res.json();
  }).then(function (data) {
    if (typeof data.fullscreen === "boolean") wmFullscreen = data.fullscreen;
    paintFullscreen();
    burstFullscreen();
  }).catch(function () { paintFullscreen(); });
}

function toggleFullscreen() {
  var api = !!document.fullscreenElement;
  if (api && document.exitFullscreen) {
    var leaving = document.exitFullscreen();
    if (leaving && leaving.catch) leaving.catch(function () {});
  }
  if (wmFullscreen) {
    bridgeFullscreen();
    return;
  }
  if (api) {
    burstFullscreen();
    return;
  }
  if (document.documentElement.requestFullscreen) {
    var entering = document.documentElement.requestFullscreen();
    if (entering && entering.then) {
      entering.then(function () { burstFullscreen(); }).catch(function () { bridgeFullscreen(); });
      return;
    }
  }
  bridgeFullscreen();
}

document.getElementById("full-btn").addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", function () {
  paintFullscreen();
  burstFullscreen();
});
try {
  var fullMode = window.matchMedia("(display-mode: fullscreen)");
  if (fullMode.addEventListener) fullMode.addEventListener("change", paintFullscreen);
} catch (err) { /* matchMedia is optional */ }
window.addEventListener("resize", function () {
  paintFullscreen();
  if (typeof placeQuickAdd === "function") placeQuickAdd();
  if (typeof placeSelectionHandle === "function") placeSelectionHandle();
  if (fsPollTimer) return;
  fsPollTimer = setTimeout(function () {
    fsPollTimer = 0;
    checkPin();
  }, 200);
});
paintFullscreen();
// The board can be pinned or unpinned outside the page too: from the bar,
// the key bind, or the midnight timer. Ask the helper again whenever the page
// comes back into view, and every 12 seconds while it is visible.
function checkPin() {
  // The wallpaper render loads this page too. It must not ask the helper.
  if (window.OMA_WALLPAPER || pinBusy || document.hidden) return;
  if (!bridgeToken) return;
  bridgeFetch("/status").then(function (res) {
    if (!res.ok) throw new Error("status");
    return res.json();
  }).then(function (data) {
    if (!pinBusy && typeof data.pinned === "boolean") paintPin(!!data.pinned);
    if (typeof data.fullscreen === "boolean") {
      wmFullscreen = data.fullscreen;
      paintFullscreen();
    }
  }).catch(function () {});
}
checkPin();
window.addEventListener("focus", checkPin);
document.addEventListener("visibilitychange", checkPin);
setInterval(checkPin, 12000);
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
