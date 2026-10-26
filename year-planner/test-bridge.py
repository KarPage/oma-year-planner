#!/usr/bin/env python3
"""Check that the pin helper refuses every request without its token.

Runs a private copy of ./bridge on a spare port with a fake wallpaper script
and a temporary runtime folder, so the real desktop is never touched.
"""
import http.client
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


def main():
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        os.chmod(tmp, 0o700)
        log = os.path.join(tmp, "calls")
        fake = os.path.join(tmp, "wallpaper")
        with open(fake, "w") as fh:
            fh.write('#!/bin/sh\necho "$1" >> "%s"\n[ "$1" = status ] && echo unpinned\nexit 0\n' % log)
        os.chmod(fake, 0o755)
        port = free_port()
        env = dict(os.environ, XDG_RUNTIME_DIR=tmp, OMA_YEAR_BRIDGE_PORT=str(port), OMA_YEAR_WALLPAPER=fake)
        out = subprocess.run([sys.executable, os.path.join(ROOT, "bridge"), "ensure"],
                             env=env, capture_output=True, text=True, timeout=10)
        token = out.stdout.strip()
        try:
            if out.returncode != 0 or len(token) != 64:
                print("bridge did not start", out.stderr, file=sys.stderr)
                return 1
            path = os.path.join(tmp, "oma-year-planner", "bridge-token")
            if stat.S_IMODE(os.stat(path).st_mode) != 0o600:
                failures.append("token file is not mode 0600")
            host = "127.0.0.1:%d" % port

            def expect(code, method, route, headers, label):
                status, _ = call(port, method, route, headers)
                if status != code:
                    failures.append("%s: got %d, want %d" % (label, status, code))

            for route, method in (("/toggle", "POST"), ("/pin", "POST"), ("/unpin", "POST"), ("/status", "GET")):
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
            expect(200, "GET", "/status", good, "status with token")
            expect(200, "POST", "/toggle", good, "toggle with token")
            calls = [line.strip() for line in open(log)] if os.path.exists(log) else []
            if "toggle" not in calls:
                failures.append("toggle with token did not run wallpaper")
            expect(204, "OPTIONS", "/toggle", {"Host": host, "Origin": "null"}, "preflight")
        finally:
            for line in subprocess.run(["ss", "-Hltnp", "sport = :%d" % port], capture_output=True, text=True).stdout.splitlines():
                if "pid=" in line:
                    pid = int(line.split("pid=")[1].split(",")[0])
                    os.kill(pid, 15)
    if failures:
        for f in failures:
            print(f, file=sys.stderr)
        return 1
    print("bridge token check ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
