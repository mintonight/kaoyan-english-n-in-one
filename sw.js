const CACHE_NAME = 'kaoyan-n-in-one-v12';
const PRECACHE_URLS = [
  './',
  './index.html',
  './reading.html',
  './spelling.html',
  './translation.html',
  './sync.js',
  './pwa.js',
  './data/reading-data.js',
  './data/spelling-data.js',
  './data/translation-data.js',
  './manifest.webmanifest',
  './icons/lucide.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => {
          if (!res.ok) throw new Error('Precache failed: ' + u);
          return cache.put(u, res);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 跳过跨域请求（例如 https://api.github.com 的 Gist 同步接口），始终走网络
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const networkFetch = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      }).catch(() => null);

      // Stale-While-Revalidate：有缓存立即秒开（完全离线可用），联网时后台静默更新缓存
      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }

      const fresh = await networkFetch;
      if (fresh) return fresh;

      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('当前处于离线状态且未缓存该资源。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});
