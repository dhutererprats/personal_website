const STATIC_CACHE_NAME = "dhp-static-v2";
const RUNTIME_CACHE_NAME = "dhp-runtime-v2";
const OFFLINE_FALLBACK = "./astronaut-training.html";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./about.html",
  "./research.html",
  "./publications.html",
  "./astronaut-training.html",
  "./pilot-training.html",
  "./style.css",
  "./astronaut-training.css",
  "./astronaut-training.js",
  "./astronaut-training-data.js",
  "./pilot-training.css",
  "./pilot-training.js",
  "./pilot-training-data.js",
  "./theme-toggle.js",
  "./script.js",
  "./icons/astronaut.ico",
  "./icons/pwa-192.png",
  "./icons/pwa-512.png",
  "./images/home-headshot.jpg",
  "./images/research-hero-space.jpg"
];

function toAbsoluteUrl(path) {
  return new URL(path, self.location).toString();
}

function isStaticAsset(pathname) {
  return /\.(?:css|js|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(pathname);
}

async function cacheResponse(cacheName, request, response) {
  if (!response || response.status !== 200) {
    return response;
  }
  const cacheControl = String(response.headers.get("cache-control") || "").toLowerCase();
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) {
    return response;
  }
  if (response.headers.has("set-cookie")) {
    return response;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS.map(toAbsoluteUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE_NAME && key !== RUNTIME_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (!sameOrigin) {
    event.respondWith(
      fetch(request).catch(() => Response.error())
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(RUNTIME_CACHE_NAME, request, response))
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) {
            return cachedPage;
          }
          const fallback = await caches.match(toAbsoluteUrl(OFFLINE_FALLBACK));
          if (fallback) {
            return fallback;
          }
          return Response.error();
        })
    );
    return;
  }

  if (isStaticAsset(requestUrl.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => cacheResponse(STATIC_CACHE_NAME, request, response));
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => cacheResponse(RUNTIME_CACHE_NAME, request, response))
      .catch(() => caches.match(request))
  );
});
