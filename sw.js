/* Offline shell for the year planner. Registered from http and https only.
   HTML, CSS, and JS are network-first so a refresh picks up edits.
   The cache name changes when this strategy changes so an older
   cache-first worker drops its copies on activate. */
var CACHE = "year-planner-v3";
var FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./planner.js",
  "./theme.css",
  "./manifest.json",
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
