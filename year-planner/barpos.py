#!/usr/bin/env python3
"""Move this plugin's bar module between left, center, and right.

Edits the Omarchy shell layout (what the live Quickshell bar actually uses)
and, when the module is already listed, the Waybar modules-left / center /
right arrays. A missing file is left missing. An unreadable file is left
untouched. Each file that will change is copied to path.bak first.

  bar-position status
  bar-position left|center|right

Prints left, center, right, or unset on the first line. Reload notes go to
stdout as well. Set OMA_YEAR_BAR_RELOAD=0 to skip the reload.
"""
import json
import os
import re
import shutil
import subprocess
import sys

SHELL_ID = "io.github.karpage.oma-year"
WAYBAR_IDS = (
    "custom/oma-year",
    "custom/oma-year-planner",
    "io.github.karpage.oma-year",
)
SHELL_KEYS = (
    ("left", "left"),
    ("centerBegin", "center"),
    ("center", "center"),
    ("centerEnd", "center"),
    ("tray", "right"),
    ("right", "right"),
)
WAYBAR_KEYS = (
    ("modules-left", "left"),
    ("modules-center", "center"),
    ("modules-right", "right"),
)
SIDES = ("left", "center", "right")


def shell_path():
    override = os.environ.get("OMA_YEAR_SHELL_JSON")
    if override:
        return override
    return os.path.join(os.path.expanduser("~"), ".config", "omarchy", "shell.json")


def waybar_path():
    override = os.environ.get("OMA_YEAR_WAYBAR_CONFIG")
    if override:
        return override
    base = os.path.join(os.path.expanduser("~"), ".config", "waybar")
    jsonc = os.path.join(base, "config.jsonc")
    if os.path.exists(jsonc):
        return jsonc
    return os.path.join(base, "config")


def strip_jsonc(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == '"':
                    j += 1
                    break
                j += 1
            out.append(text[i:j])
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            nxt = text.find("\n", i)
            if nxt < 0:
                break
            out.append("\n")
            i = nxt
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            nxt = text.find("*/", i + 2)
            i = n if nxt < 0 else nxt + 2
            out.append(" ")
            continue
        out.append(c)
        i += 1
    return "".join(out)


def loads_jsonc(text):
    cleaned = re.sub(r",(\s*[}\]])", r"\1", strip_jsonc(text))
    return json.loads(cleaned)


def skip_ws(text, i):
    n = len(text)
    while i < n:
        if text[i] in " \t\r\n":
            i += 1
            continue
        if text.startswith("//", i):
            nxt = text.find("\n", i)
            i = n if nxt < 0 else nxt + 1
            continue
        if text.startswith("/*", i):
            nxt = text.find("*/", i + 2)
            i = n if nxt < 0 else nxt + 2
            continue
        break
    return i


def match_bracket(text, i, open_ch, close_ch):
    depth = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == '"':
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == '"':
                    i += 1
                    break
                i += 1
            continue
        if text.startswith("//", i):
            nxt = text.find("\n", i)
            i = n if nxt < 0 else nxt + 1
            continue
        if text.startswith("/*", i):
            nxt = text.find("*/", i + 2)
            i = n if nxt < 0 else nxt + 2
            continue
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def find_key_array(text, key, limit=None):
    """Return (open_index, close_index) of the array for a JSON key, or None."""
    end = len(text) if limit is None else limit
    needle = '"' + key + '"'
    i = 0
    while i < end:
        i = text.find(needle, i, end)
        if i < 0:
            return None
        j = skip_ws(text, i + len(needle))
        if j < end and text[j] == ":":
            j = skip_ws(text, j + 1)
            if j < end and text[j] == "[":
                close = match_bracket(text, j, "[", "]")
                if close > j:
                    return j, close
        i += len(needle)
    return None


def layout_span(text):
    needle = '"layout"'
    i = text.find(needle)
    while i >= 0:
        j = skip_ws(text, i + len(needle))
        if j < len(text) and text[j] == ":":
            j = skip_ws(text, j + 1)
            if j < len(text) and text[j] == "{":
                close = match_bracket(text, j, "{", "}")
                if close > j:
                    return j, close
        i = text.find(needle, i + len(needle))
    return None


def split_items(inner):
    items = []
    i = 0
    n = len(inner)
    while i < n:
        i = skip_ws(inner, i)
        if i >= n:
            break
        if inner[i] == ",":
            i += 1
            continue
        start = i
        if inner[i] == '"':
            i += 1
            while i < n:
                if inner[i] == "\\":
                    i += 2
                    continue
                if inner[i] == '"':
                    i += 1
                    break
                i += 1
        elif inner[i] == "{":
            close = match_bracket(inner, i, "{", "}")
            i = n if close < 0 else close + 1
        elif inner[i] == "[":
            close = match_bracket(inner, i, "[", "]")
            i = n if close < 0 else close + 1
        else:
            while i < n and inner[i] not in ",]":
                i += 1
        raw = inner[start:i].strip()
        if raw:
            items.append(raw)
    return items


def item_matches(raw, names):
    piece = raw.strip().rstrip(",")
    if not piece:
        return False
    try:
        value = loads_jsonc(piece)
    except (ValueError, json.JSONDecodeError):
        return False
    if isinstance(value, str):
        return value in names
    if isinstance(value, dict):
        for field in ("id", "module", "name"):
            if value.get(field) in names:
                return True
    return False


def array_hits(text, keys, names, region=None):
    hits = []
    start = 0
    end = len(text)
    if region:
        start, end = region
    chunk = text[start:end]
    for key, side in keys:
        found = find_key_array(chunk, key)
        if not found:
            continue
        open_i, close_i = found
        inner = chunk[open_i + 1:close_i]
        for raw in split_items(inner):
            if item_matches(raw, names):
                hits.append(side)
                break
    return hits


def sole_side(hits):
    if not hits:
        return "unset"
    if all(side == hits[0] for side in hits):
        return hits[0]
    return "unset"


def indent_of(text, index):
    line = text.rfind("\n", 0, index) + 1
    i = line
    while i < len(text) and text[i] in " \t":
        i += 1
    return text[line:i]


def rewrite_arrays(text, keys, names, target, insert_literal, region=None, canonical=None):
    """Move matching entries into `target`. Returns (new_text, changed, present)."""
    start = 0
    end = len(text)
    if region:
        start, end = region
    prefix = text[:start]
    chunk = text[start:end]
    suffix = text[end:]
    present = False
    spans = []
    for key, side in keys:
        found = find_key_array(chunk, key)
        if not found:
            continue
        open_i, close_i = found
        inner = chunk[open_i + 1:close_i]
        items = split_items(inner)
        matched = [item_matches(raw, names) for raw in items]
        if any(matched):
            present = True
        spans.append((open_i, close_i, key, side, items, matched, inner))
    if not spans:
        return text, False, False
    home = canonical.get(target, target) if canonical else target
    if not any(span[2] == home for span in spans):
        raise ValueError("No %s section to move the module into." % home)
    only_home = True
    home_count = 0
    for _open, _close, key, side, _items, matched, _inner in spans:
        count = sum(1 for flag in matched if flag)
        if key == home:
            home_count += count
        elif count:
            only_home = False
        elif side == target and key != home and count:
            only_home = False
    if present and only_home and home_count == 1 and not insert_literal:
        return text, False, True
    if present and only_home and home_count == 1:
        return text, False, True
    if not present and not insert_literal:
        return text, False, False
    literal = insert_literal
    for _open, _close, _key, _side, items, matched, _inner in spans:
        for raw, flag in zip(items, matched):
            if flag:
                literal = raw.strip()
                break
        if literal and literal != insert_literal:
            break

    changed = False
    for open_i, close_i, key, _side, items, matched, inner in reversed(spans):
        new_items = [raw for raw, flag in zip(items, matched) if not flag]
        if key == home and literal and all(item.strip() != literal for item in new_items):
            new_items.append(literal)
        if [item.strip() for item in new_items] == [item.strip() for item in items]:
            continue
        multiline = "\n" in inner
        if not new_items:
            body = ""
        elif multiline:
            pad = indent_of(chunk, open_i)
            item_pad = pad + "  "
            body = "\n" + ",\n".join(item_pad + item.strip() for item in new_items) + "\n" + pad
        else:
            body = " " + ", ".join(item.strip() for item in new_items) + " "
        chunk = chunk[:open_i + 1] + body + chunk[close_i:]
        changed = True
    if not changed:
        return text, False, present
    return prefix + chunk + suffix, True, True


def read_text(path):
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def validate(path, text):
    try:
        loads_jsonc(text)
    except (ValueError, json.JSONDecodeError) as err:
        raise ValueError("%s is not valid JSON: %s" % (path, err))


def backup(path):
    shutil.copy2(path, path + ".bak")


def write_text(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


def current_side(shell_text, waybar_text):
    shell_hits = []
    if shell_text is not None:
        region = layout_span(shell_text)
        shell_hits = array_hits(shell_text, SHELL_KEYS, (SHELL_ID,), region)
        if not shell_hits:
            shell_hits = array_hits(shell_text, SHELL_KEYS, (SHELL_ID,), None)
    if shell_hits:
        return sole_side(shell_hits)
    if waybar_text is not None:
        return sole_side(array_hits(waybar_text, WAYBAR_KEYS, WAYBAR_IDS, None))
    return "unset"


def reload_bars(touched):
    if os.environ.get("OMA_YEAR_BAR_RELOAD") == "0":
        print("reload skipped")
        return
    if "shell" in touched:
        if shutil.which("omarchy-shell"):
            subprocess.call(["omarchy-shell", "shell", "reloadConfig"])
            print("reloaded omarchy shell")
        elif shutil.which("omarchy-restart-waybar"):
            subprocess.call(["omarchy-restart-waybar"])
            print("reloaded bar")
    if "waybar" in touched:
        if shutil.which("omarchy-restart-waybar"):
            subprocess.call(["omarchy-restart-waybar"])
            print("reloaded waybar")
        else:
            subprocess.call(["pkill", "-USR2", "waybar"])
            print("signaled waybar")


def load_pair():
    shell = shell_path()
    waybar = waybar_path()
    shell_text = None
    waybar_text = None
    errors = []
    if os.path.exists(shell):
        try:
            shell_text = read_text(shell)
            validate(shell, shell_text)
        except (OSError, ValueError) as err:
            errors.append(str(err))
            shell_text = None
            shell = None
    else:
        shell = None
    if os.path.exists(waybar):
        try:
            waybar_text = read_text(waybar)
            validate(waybar, waybar_text)
        except (OSError, ValueError) as err:
            errors.append(str(err))
            waybar_text = None
            waybar = None
    else:
        waybar = None
    return shell, shell_text, waybar, waybar_text, errors


def main(argv):
    if len(argv) != 2 or argv[1] not in ("status",) + SIDES:
        print("usage: bar-position status|left|center|right", file=sys.stderr)
        return 2
    cmd = argv[1]
    shell, shell_text, waybar, waybar_text, errors = load_pair()
    for message in errors:
        print(message, file=sys.stderr)
    if errors:
        return 1
    if cmd == "status":
        if shell_text is None and waybar_text is None:
            if errors:
                return 1
            print("No Omarchy shell config or Waybar config was found.", file=sys.stderr)
            print("unset")
            return 1
        print(current_side(shell_text, waybar_text))
        return 0
    if shell_text is None and waybar_text is None:
        if not errors:
            print("No Omarchy shell config or Waybar config was found.", file=sys.stderr)
        return 1
    target = cmd
    touched = []
    if shell and shell_text is not None:
        region = layout_span(shell_text)
        canon = {"left": "left", "center": "center", "right": "right"}
        new_text, changed, _present = rewrite_arrays(
            shell_text, SHELL_KEYS, (SHELL_ID,), target, '"' + SHELL_ID + '"', region, canon
        )
        if not changed and region and not _present:
            new_text, changed, _present = rewrite_arrays(
                shell_text, SHELL_KEYS, (SHELL_ID,), target, '"' + SHELL_ID + '"', None, canon
            )
        if changed:
            try:
                validate(shell, new_text)
            except ValueError as err:
                print(str(err), file=sys.stderr)
                return 1
            backup(shell)
            write_text(shell, new_text)
            shell_text = new_text
            touched.append("shell")
    if waybar and waybar_text is not None:
        # Do not invent a Waybar module that is not already configured.
        new_text, changed, _present = rewrite_arrays(
            waybar_text, WAYBAR_KEYS, WAYBAR_IDS, target, None, None,
            {"left": "modules-left", "center": "modules-center", "right": "modules-right"},
        )
        if changed:
            try:
                validate(waybar, new_text)
            except ValueError as err:
                print(str(err), file=sys.stderr)
                return 1
            backup(waybar)
            write_text(waybar, new_text)
            waybar_text = new_text
            touched.append("waybar")
    print(current_side(shell_text, waybar_text))
    if touched:
        reload_bars(touched)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
