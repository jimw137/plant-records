// Plant Records (standalone) — keeps everything in this browser using IndexedDB.
// It stands in for the Claude services the app was first built with:
//   artifact  -> saves the plant data      assets -> stores photos
//   downloads -> saves backup files        sample (AI) -> not available
(function () {
  const DB_NAME = 'plant-records', DB_VER = 1;
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function run(store, mode, fn) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      let out;
      const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  function newId() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  window.claude = {
    use: async (name) => {
      if (name === 'artifact') return {
        publish: async (json) => { await run('kv', 'readwrite', st => st.put(json, 'state')); }
      };
      if (name === 'assets') return {
        upload: async (blob) => { const id = newId(); await run('photos', 'readwrite', st => st.put(blob, id)); return { id }; }
      };
      if (name === 'downloads') return {
        save: async ({ filename, data }) => {
          const url = URL.createObjectURL(data);
          const a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      };
      return null; // AI features (Identify, Auto-tag) are not available here
    }
  };

  function waitForController(ms) {
    return new Promise(resolve => {
      if (navigator.serviceWorker.controller) return resolve(true);
      const done = () => resolve(!!navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
      setTimeout(done, ms);
    });
  }

  async function start() {
    // the service worker makes the app work offline and serves the photos
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;
        await waitForController(4000);
      } catch (e) { console.warn('Service worker not available', e); }
    }
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
    let json = null;
    try { json = await run('kv', 'readonly', st => st.get('state')); } catch (e) { console.warn('Storage not available', e); }
    if (json) document.getElementById('app-data').textContent = json;
    else document.getElementById('sa-banner').hidden = false;
    const s = document.createElement('script');
    s.src = 'app.js';
    document.body.appendChild(s);
  }
  start();
})();
