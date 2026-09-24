/*
 * Verbal Aikido — Service Worker
 * Cache-first for app shell and content; network-fallback-to-cache for media.
 */

const CACHE_VERSION = 'v7';
const SHELL_CACHE = `va-game-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `va-game-media-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './game.css',
  './game.js',
  './content.json',
  './i18n/en.json',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-192.png',
  './icons/icon-512.svg',
  './icons/icon-512.png',
  './icons/maskable-icon.png',
  './icons/maskable-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== MEDIA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isShellAsset(url) {
  const pathname = new URL(url).pathname;
  const shellPaths = new Set(SHELL_ASSETS.map((p) => new URL(p, self.location.href).pathname));
  return shellPaths.has(pathname);
}

function isMediaRequest(request) {
  const dest = request.destination;
  return dest === 'image' || dest === 'audio' || dest === 'video' || dest === 'font';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  if (request.method !== 'GET') {
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (isMediaRequest(request)) {
    event.respondWith(networkFallbackToCache(request, MEDIA_CACHE));
    return;
  }

  // Everything else: try network, fall back to cache if offline.
  event.respondWith(networkFallbackToCache(request, SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFallbackToCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
