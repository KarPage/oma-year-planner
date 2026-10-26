/* Offline shell. Registered from http and https only.
   Network first, then the cache, so a refresh picks up edits. */
importScripts("version.js");
var CACHE = "year-planner-v" + VERSION;
var FILES = [
  "./",
  "./index.html",
  "./app.css",
  "./version.js",
  "./config.js",
  "./planner.js",
  "./store.js",
  "./board.js",
  "./popovers.js",
  "./editor.js",
  "./gcal.js",
  "./app.js",
  "./theme.css",
  "./theme-defaults.css",
  "./app.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILES);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }));
  self.clients.claim();
});

function sameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (err) {
    return false;
  }
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  if (!sameOrigin(event.request)) return;
  event.respondWith(fetch(event.request).then(function (response) {
    if (response && response.ok && response.type === "basic") {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put(event.request, copy);
      });
    }
    return response;
  }).catch(function () {
    return caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      return new Response("", { status: 504, statusText: "Offline" });
    });
  }));
});
