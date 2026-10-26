#!/usr/bin/env node
/* Run Planner.selfCheck. No dependencies. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var file = path.join(__dirname, "planner.js");
var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });

if (!sandbox.Planner || typeof sandbox.Planner.selfCheck !== "function") {
  console.error("Planner.selfCheck is missing");
  process.exit(1);
}

var errors = sandbox.Planner.selfCheck();
if (errors.length) {
  errors.forEach(function (error) { console.error(error); });
  process.exit(1);
}

var versionFile = fs.readFileSync(path.join(__dirname, "version.js"), "utf8");
var versionMatch = versionFile.match(/var VERSION = "([^"]+)"/);
if (!versionMatch) {
  console.error("VERSION missing");
  process.exit(1);
}
var version = versionMatch[1];
var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "app.webmanifest"), "utf8"));
if (manifest.version !== version) {
  console.error("manifest version");
  process.exit(1);
}
var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
if (pkg.version !== version) {
  console.error("package version");
  process.exit(1);
}
var worker = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
if (worker.indexOf('importScripts("version.js")') === -1 || worker.indexOf('"year-planner-v" + VERSION') === -1) {
  console.error("service worker version");
  process.exit(1);
}

console.log("selfCheck ok");

// The pin helper must refuse every request without its per-login token.
var child = require("child_process");
var bridgeTest = child.spawnSync("python3", [path.join(__dirname, "test-bridge.py")], { encoding: "utf8" });
if (bridgeTest.error) {
  console.log("bridge token check skipped (python3 not found)");
} else {
  process.stderr.write(bridgeTest.stderr || "");
  process.stdout.write(bridgeTest.stdout || "");
  if (bridgeTest.status !== 0) process.exit(1);
}
