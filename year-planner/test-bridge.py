#!/usr/bin/env python3
"""Check that the pin helper refuses every request without its token,
and that the token never shows up on a command line or in output.

Runs a private copy of ./bridge on a spare port with a fake wallpaper script
and a temporary runtime folder, so the real desktop is never touched.
"""
import http.client
import json
import os
import socket
import stat
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.abspath(__file__))


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def call(port, method, path, headers):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request(method, path, headers=headers)
    res = conn.getresponse()
    body = res.read()
    conn.close()
    return res.status, body


def argv_leaks(token):
    """No process on the machine may carry the token on its command line."""
    leaks = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open("/proc/%s/cmdline" % pid, "rb") as fh:
                if token.encode() in fh.read():
                    leaks.append("token found in argv of pid " + pid)
        except OSError:
            pass
    return leaks


def check_launcher(env, folder, token):
    failures = []
    out = subprocess.run([sys.executable, os.path.join(ROOT, "bridge"), "launch"],
                         env=env, capture_output=True, text=True, timeout=10)
    page = out.stdout.strip()
    if out.returncode != 0 or page != os.path.join(folder, "index.html"):
        return ["launch did not print the launcher path: %r" % out.stdout]
    if token in out.stdout or token in out.stderr:
        failures.append("launch printed the token")
    if stat.S_IMODE(os.stat(page).st_mode) != 0o600:
        failures.append("launcher page is not mode 0600")
    body = open(page).read()
    want = "index.html#bt=" + token
    if want not in body or "location.replace(" not in body:
        failures.append("launcher page does not forward to the planner with the token")
    served = subprocess.run([sys.executable, os.path.join(ROOT, "bridge"), "launch", "served"],
                            env=env, capture_output=True, text=True, timeout=10)
    spage = served.stdout.strip()
    if served.returncode != 0 or not spage.endswith("served.html"):
        failures.append("launch served failed")
    else:
        if stat.S_IMODE(os.stat(spage).st_mode) != 0o600:
            failures.append("served launcher is not mode 0600")
        if "http://localhost:8080/#bt=" + token not in open(spage).read():
            failures.append("served launcher does not forward to localhost:8080")
        os.unlink(spage)
    return failures


def check_open(env, tmp, folder, token):
    """Run ./open with a fake chromium and check what it was given."""
    failures = []
    stubs = os.path.join(tmp, "bin")
    os.mkdir(stubs)
    argv_log = os.path.join(tmp, "chromium-argv")
    with open(os.path.join(stubs, "chromium"), "w") as fh:
        fh.write('#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\n' % argv_log)
    with open(os.path.join(stubs, "hyprctl"), "w") as fh:
        fh.write("#!/bin/sh\nexit 1\n")
    for name in ("chromium", "hyprctl"):
        os.chmod(os.path.join(stubs, name), 0o755)
    run_env = dict(env, PATH=stubs + os.pathsep + env.get("PATH", ""))
    out = subprocess.run([os.path.join(ROOT, "open")], env=run_env,
                         capture_output=True, text=True, timeout=30)
    if out.returncode != 0 or not os.path.exists(argv_log):
        return ["open did not start chromium: %s" % out.stderr.strip()]
    args = open(argv_log).read()
    if token in args:
        failures.append("open put the token on chromium's command line")
    if "--app=file://" + os.path.join(folder, "index.html") not in args:
        failures.append("open did not hand chromium the launcher page: %r" % args)
    if token in out.stdout or token in out.stderr:
        failures.append("open printed the token")
    return failures


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        os.chmod(tmp, 0o700)
        log = os.path.join(tmp, "calls")
        fake = os.path.join(tmp, "wallpaper")
        with open(fake, "w") as fh:
            fh.write('#!/bin/sh\necho "$1" >> "%s"\n[ "$1" = status ] && echo unpinned\nexit 0\n' % log)
        os.chmod(fake, 0o755)
        fake_app = os.path.join(tmp, "app")
        fs_flag = os.path.join(tmp, "fs")
        with open(fake_app, "w") as fh:
            fh.write(
                "#!/bin/sh\n"
                "flag=\"%s\"\n"
                "if [ \"$1\" = fullscreen ]; then\n"
                "  if [ -f \"$flag\" ]; then rm \"$flag\"; else touch \"$flag\"; fi\n"
                "fi\n"
                "if [ -f \"$flag\" ]; then echo \"windows=1 fullscreen=1 bridge=0\"\n"
                "else echo \"windows=0 fullscreen=0 bridge=0\"\n"
                "fi\n"
                "exit 0\n" % fs_flag
            )
        os.chmod(fake_app, 0o755)
        port = free_port()
        env = dict(os.environ, XDG_RUNTIME_DIR=tmp, OMA_YEAR_BRIDGE_PORT=str(port),
                   OMA_YEAR_WALLPAPER=fake, OMA_YEAR_APP=fake_app, OMA_YEAR_LAUNCH_TTL="1")
        out = subprocess.run([sys.executable, os.path.join(ROOT, "bridge"), "ensure"],
                             env=env, capture_output=True, text=True, timeout=10)
        folder = os.path.join(tmp, "oma-year-planner")
        path = os.path.join(folder, "bridge-token")
        token = open(path).read().strip() if os.path.exists(path) else ""
        try:
            if out.returncode != 0 or len(token) != 64:
                print("bridge did not start", out.stderr, file=sys.stderr)
                return 1
            if out.stdout.strip():
                failures.append("ensure printed something")
            if stat.S_IMODE(os.stat(path).st_mode) != 0o600:
                failures.append("token file is not mode 0600")
            if stat.S_IMODE(os.stat(folder).st_mode) != 0o700:
                failures.append("token folder is not mode 0700")
            failures.extend(check_launcher(env, folder, token))
            failures.extend(check_open(env, tmp, folder, token))
            if os.path.exists(log):
                os.unlink(log)  # ./open runs "wallpaper refresh" when chromium exits.
            host = "127.0.0.1:%d" % port

            def expect(code, method, route, headers, label):
                status, _ = call(port, method, route, headers)
                if status != code:
                    failures.append("%s: got %d, want %d" % (label, status, code))

            for route, method in (("/toggle", "POST"), ("/pin", "POST"), ("/unpin", "POST"),
                                   ("/fullscreen", "POST"), ("/fullscreen", "GET"), ("/status", "GET")):
                expect(403, method, route, {"Host": host, "Origin": "null"}, "no token " + route)
                expect(403, method, route, {"Host": host, "Origin": "null", "X-Planner-Token": "0" * 64}, "wrong token " + route)
                expect(403, method, route, {"Host": host, "Origin": "null", "X-Planner-Token": token[:-1]}, "short token " + route)
            good = {"Host": host, "Origin": "null", "X-Planner-Token": token}
            expect(403, "POST", "/toggle", dict(good, Origin="https://evil.example"), "bad origin")
            expect(403, "POST", "/toggle", dict(good, Host="rebind.example:%d" % port), "bad host")
            expect(404, "GET", "/toggle", good, "GET never runs an action")
            expect(403, "PUT", "/toggle", good, "PUT")
            if os.path.exists(log) and any(line.strip() != "status" for line in open(log)):
                failures.append("wallpaper ran an action without a valid token")
            status_code, status_body = call(port, "GET", "/status", good)
            if status_code != 200:
                failures.append("status with token: got %d" % status_code)
            else:
                try:
                    payload = json.loads(status_body.decode())
                except ValueError:
                    payload = {}
                if payload.get("fullscreen") is not False:
                    failures.append("status fullscreen should start false")
            expect(200, "POST", "/fullscreen", good, "fullscreen with token")
            status_code, status_body = call(port, "GET", "/status", good)
            try:
                payload = json.loads(status_body.decode()) if status_code == 200 else {}
            except ValueError:
                payload = {}
            if payload.get("fullscreen") is not True:
                failures.append("fullscreen toggle did not stick")
            expect(200, "POST", "/toggle", good, "toggle with token")
            calls = [line.strip() for line in open(log)] if os.path.exists(log) else []
            if "toggle" not in calls:
                failures.append("toggle with token did not run wallpaper")
            expect(204, "OPTIONS", "/toggle", {"Host": host, "Origin": "null"}, "preflight")
            failures.extend(argv_leaks(token))
            # The helper deletes launcher pages after OMA_YEAR_LAUNCH_TTL (1s here).
            launcher = os.path.join(folder, "index.html")
            subprocess.run([sys.executable, os.path.join(ROOT, "bridge"), "launch"],
                           env=env, capture_output=True, timeout=10)
            for _ in range(40):
                if not os.path.exists(launcher):
                    break
                time.sleep(0.1)
            else:
                failures.append("launcher page was not deleted after its TTL")
        finally:
            for line in subprocess.run(["ss", "-Hltnp", "sport = :%d" % port], capture_output=True, text=True).stdout.splitlines():
                if "pid=" in line:
                    pid = int(line.split("pid=")[1].split(",")[0])
                    os.kill(pid, 15)
    if failures:
        for f in failures:
            print(f, file=sys.stderr)
        return 1
    print("bridge token and launcher check ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
