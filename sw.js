// Plant Records service worker: offline use + serving photos stored in this browser.
const CACHE = 'plant-records-v1';
const CORE = ['./', 'index.html', 'app.js', 'storage.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function getPhoto(id) {
  return new Promise((resolve) => {
    const req = indexedDB.open('plant-records', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
    };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const g = req.result.transaction('photos', 'readonly').objectStore('photos').get(id);
        g.onsuccess = () => resolve(g.result || null);
        g.onerror = () => resolve(null);
      } catch (err) { resolve(null); }
    };
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.includes('/_blob/')) {
    const id = decodeURIComponent(url.pathname.split('/_blob/')[1] || '');
    e.respondWith(getPhoto(id).then(blob => blob
      ? new Response(req.method === 'HEAD' ? null : blob, { headers: { 'Content-Type': blob.type || 'image/jpeg', 'Cache-Control': 'no-store' } })
      : new Response('Not found', { status: 404 })));
    return;
  }
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    // app files: use the newest version when online, the saved copy when offline
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
