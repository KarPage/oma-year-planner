#!/usr/bin/env python3
"""Config-edit tests for bar position. No desktop session is touched."""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(ROOT, "barpos.py")

SHELL = """{
  "theme": "osaka-jade",
  "bar": {
    "layout": {
      "left": ["clock"],
      "centerBegin": [],
      "center": ["workspaces"],
      "centerEnd": [],
      "tray": ["tray"],
      "right": ["io.github.karpage.oma-year", "battery"]
    }
  },
  "settings": { "gap": 0, }
}
"""

WAYBAR = """// top comment
{
  "layer": "top", // keep
  "modules-left": [
    "clock",
  ],
  "modules-center": [
    "custom/other",
  ],
  "modules-right": [
    "custom/oma-year",
    "battery",
  ],
  "margin": 0,
}
"""


def run(tmp, args):
    env = dict(
        os.environ,
        OMA_YEAR_SHELL_JSON=os.path.join(tmp, "shell.json"),
        OMA_YEAR_WAYBAR_CONFIG=os.path.join(tmp, "waybar.jsonc"),
        OMA_YEAR_BAR_RELOAD="0",
    )
    return subprocess.run(
        [sys.executable, SCRIPT] + args,
        env=env, capture_output=True, text=True,
    )


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        shell = os.path.join(tmp, "shell.json")
        waybar = os.path.join(tmp, "waybar.jsonc")
        with open(shell, "w", encoding="utf-8") as fh:
            fh.write(SHELL)
        with open(waybar, "w", encoding="utf-8") as fh:
            fh.write(WAYBAR)
        status = run(tmp, ["status"])
        if status.returncode != 0 or status.stdout.splitlines()[0] != "right":
            failures.append("status right: %r %r" % (status.stdout, status.stderr))
        moved = run(tmp, ["left"])
        if moved.returncode != 0 or moved.stdout.splitlines()[0] != "left":
            failures.append("move left: %r %r" % (moved.stdout, moved.stderr))
        shell_text = open(shell, encoding="utf-8").read()
        waybar_text = open(waybar, encoding="utf-8").read()
        if '"theme": "osaka-jade"' not in shell_text or '"settings"' not in shell_text:
            failures.append("shell settings lost")
        if '"gap": 0' not in shell_text:
            failures.append("shell trailing comma lost")
        if shell_text.count("io.github.karpage.oma-year") != 1 or '"left"' not in shell_text:
            failures.append("shell module not moved once")
        if "clock" not in shell_text or "workspaces" not in shell_text or "battery" not in shell_text:
            failures.append("shell neighbours lost")
        left_block = shell_text.split('"left"', 1)[1].split("]", 1)[0]
        if "io.github.karpage.oma-year" not in left_block:
            failures.append("shell module not in left")
        right_block = shell_text.split('"right"', 1)[1].split("]", 1)[0]
        if "io.github.karpage.oma-year" in right_block:
            failures.append("shell module still in right")
        if "// top comment" not in waybar_text or "// keep" not in waybar_text:
            failures.append("waybar comments lost")
        if '"margin": 0' not in waybar_text:
            failures.append("waybar trailing comma lost")
        if waybar_text.count("custom/oma-year") != 1:
            failures.append("waybar module count")
        wleft = waybar_text.split('"modules-left"', 1)[1].split("]", 1)[0]
        wright = waybar_text.split('"modules-right"', 1)[1].split("]", 1)[0]
        if "custom/oma-year" not in wleft or "custom/oma-year" in wright:
            failures.append("waybar module not moved")
        if "battery" not in wright or "custom/other" not in waybar_text:
            failures.append("waybar neighbours lost")
        again = open(shell, encoding="utf-8").read()
        again_w = open(waybar, encoding="utf-8").read()
        second = run(tmp, ["left"])
        if second.returncode != 0 or open(shell, encoding="utf-8").read() != again:
            failures.append("shell second move was not a no-op")
        if open(waybar, encoding="utf-8").read() != again_w:
            failures.append("waybar second move was not a no-op")
        if not os.path.exists(shell + ".bak") or not os.path.exists(waybar + ".bak"):
            failures.append("backup missing")

        bad = os.path.join(tmp, "waybar.jsonc")
        before = open(bad, encoding="utf-8").read()
        with open(bad, "w", encoding="utf-8") as fh:
            fh.write("{ this is not json\n")
        broken = run(tmp, ["center"])
        if broken.returncode == 0:
            failures.append("invalid waybar should fail")
        if open(bad, encoding="utf-8").read() != "{ this is not json\n":
            failures.append("invalid waybar was modified")
        if "not valid JSON" not in broken.stderr and "not valid" not in broken.stderr.lower():
            failures.append("invalid waybar message: %r" % broken.stderr)
        # shell must not be half-applied when waybar fails first... load_pair
        # drops the bad waybar and still edits shell. Restore waybar and confirm
        # a missing path is not created.
        os.remove(bad)
        missing = run(tmp, ["status"])
        if os.path.exists(bad):
            failures.append("missing waybar was created")
        with open(bad, "w", encoding="utf-8") as fh:
            fh.write(before)

        os.remove(shell)
        os.remove(waybar)
        gone = run(tmp, ["right"])
        if gone.returncode == 0:
            failures.append("missing configs should fail")
        if os.path.exists(shell) or os.path.exists(waybar):
            failures.append("missing configs were created")
        if "No Omarchy" not in gone.stderr:
            failures.append("missing message: %r" % gone.stderr)

        # Waybar without the module stays put when the shell can move.
        with open(shell, "w", encoding="utf-8") as fh:
            fh.write(SHELL)
        plain = """{
  "modules-left": ["clock"],
  "modules-center": ["custom/other"],
  "modules-right": ["battery"]
}
"""
        with open(waybar, "w", encoding="utf-8") as fh:
            fh.write(plain)
        only_shell = run(tmp, ["center"])
        if only_shell.returncode != 0:
            failures.append("shell-only move failed: %r" % only_shell.stderr)
        if open(waybar, encoding="utf-8").read() != plain:
            failures.append("waybar without the module was edited")
        center = open(shell, encoding="utf-8").read().split('"center"', 1)[1].split("]", 1)[0]
        if "io.github.karpage.oma-year" not in center:
            failures.append("shell did not move into center")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("bar position ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
