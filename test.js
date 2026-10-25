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

console.log("selfCheck ok");
