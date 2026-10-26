#!/bin/sh
# Planner window helpers for the bar menu.
#   ./app status       windows=N fullscreen=0|1 bridge=0|1
#   ./app fullscreen   open the planner if needed, then toggle full screen
#   ./app quit         close every planner window and stop the pin helper
#   ./app quit --dry-run   say what quit would close, change nothing
# Quit leaves the pinned wallpaper and its midnight timer alone.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PORT=47321
# Planner windows are Chromium app windows whose class names the planner page,
# e.g. chrome-__home_me_year-planner_index.html-Default. Tests can narrow this.
MATCH=${OMA_YEAR_WINDOW_MATCH:-year-planner}

# One line per planner window: "<address> <fullscreen> <class>"
windows() {
  command -v hyprctl >/dev/null 2>&1 || return 0
  hyprctl clients -j 2>/dev/null | MATCH=$MATCH python3 -c '
import json, os, sys
match = os.environ["MATCH"]
try:
    clients = json.load(sys.stdin)
except ValueError:
    clients = []
for c in clients:
    cls = c.get("class") or ""
    if cls.startswith("chrome-") and match in cls and "index.html" in cls:
        print(c.get("address"), 1 if c.get("fullscreen") else 0, cls)
'
}

# PID of the pin helper, only if the process on the port really is ./bridge.
bridge_pid() {
  pid=$(ss -Hltnp "sport = :$PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n 1)
  [ -n "$pid" ] || return 0
  if tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q 'bridge'; then
    echo "$pid"
  fi
}

# Hyprland's Lua dispatchers take a window selector such as "address:0x...".
dispatch() {
  hyprctl dispatch "$1" >/dev/null 2>&1
}

cmd_status() {
  list=$(windows)
  count=0
  full=0
  if [ -n "$list" ]; then
    count=$(printf '%s\n' "$list" | wc -l | tr -d ' ')
    if printf '%s\n' "$list" | awk '$2 == 1 { found = 1 } END { exit !found }'; then
      full=1
    fi
  fi
  bridge=0
  [ -n "$(bridge_pid)" ] && bridge=1
  echo "windows=$count fullscreen=$full bridge=$bridge"
}

cmd_fullscreen() {
  list=$(windows)
  if [ -z "$list" ]; then
    setsid "$ROOT/open" >/dev/null 2>&1 < /dev/null &
    tries=0
    while [ -z "$list" ] && [ "$tries" -lt 40 ]; do
      sleep 0.25
      tries=$((tries + 1))
      list=$(windows)
    done
    [ -n "$list" ] || { echo "app: planner window did not open" >&2; exit 1; }
    sleep 0.3
  fi
  addr=$(printf '%s\n' "$list" | head -n 1 | cut -d' ' -f1)
  dispatch "hl.dsp.focus({ window = \"address:$addr\" })" || true
  dispatch "hl.dsp.window.fullscreen({ mode = \"fullscreen\", window = \"address:$addr\" })"
}

cmd_quit() {
  dry=${1:-}
  list=$(windows)
  pid=$(bridge_pid)
  if [ "$dry" = "--dry-run" ]; then
    printf '%s\n' "$list" | awk 'NF { print "would close " $1 " " $3 }'
    [ -n "$pid" ] && echo "would stop bridge $pid"
    return 0
  fi
  printf '%s\n' "$list" | while read -r addr _ _; do
    [ -n "$addr" ] || continue
    dispatch "hl.dsp.window.close({ window = \"address:$addr\" })" || true
  done
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
  fi
  tries=0
  while [ -n "$(windows)" ] && [ "$tries" -lt 20 ]; do
    sleep 0.15
    tries=$((tries + 1))
  done
  cmd_status
}

case ${1:-} in
  status) cmd_status ;;
  fullscreen) cmd_fullscreen ;;
  quit) cmd_quit "${2:-}" ;;
  *)
    echo "usage: app status|fullscreen|quit [--dry-run]" >&2
    exit 2
    ;;
esac
