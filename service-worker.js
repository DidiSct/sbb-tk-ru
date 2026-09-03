/* Service worker untuk Sistem Informasi TK.
   Tujuannya: setelah dibuka sekali secara online, aplikasi (HTML + mesin
   SQLite dari CDN) tetap bisa dibuka walau sedang offline. Data sekolah
   sendiri TIDAK disimpan di sini — itu sudah tersimpan permanen di
   IndexedDB milik browser dan tidak terpengaruh oleh service worker ini. */

const CACHE_NAME = 'si-tk-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(()=> self.skipWaiting())
      .catch(err => console.error('SW install cache gagal', err))
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(()=> self.clients.claim())
  );
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  // Halaman HTML: coba jaringan dulu (biar selalu dapat versi terbaru saat online),
  // kalau gagal/offline baru pakai salinan dari cache.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if(isHTML){
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(()=> caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Aset lain (mesin SQLite dari CDN, manifest, ikon): pakai cache dulu
  // supaya instan & tetap jalan offline, sambil diam-diam diperbarui di
  // latar belakang kalau sedang online.
  event.respondWith(
    caches.match(req).then(cached=>{
      const fetchPromise = fetch(req).then(res=>{
        if(res && res.status===200){
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(()=> cached);
      return cached || fetchPromise;
    })
  );
});
