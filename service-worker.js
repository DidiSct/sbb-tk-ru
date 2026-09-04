/* Service worker untuk Sistem Informasi TK.
   Tujuannya: setelah dibuka sekali secara online, aplikasi (HTML + mesin
   SQLite dari CDN) tetap bisa dibuka walau sedang offline. Data sekolah
   sendiri TIDAK disimpan di sini — itu sudah tersimpan permanen di
   IndexedDB milik browser dan tidak terpengaruh oleh service worker ini.

   PENTING — versi cache: setiap kali men-deploy perubahan ke GitHub/hosting,
   naikkan angka di CACHE_NAME (mis. 'v1' -> 'v2'). Ini memaksa browser
   mengenali service worker sebagai "berbeda", langsung memicu update, dan
   otomatis membuang cache lama (lihat listener 'activate' di bawah). */

const CACHE_NAME = 'si-tk-shell-v2';
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
      .then(()=> self.skipWaiting()) // jangan tunggu tab lama ditutup — langsung ambil alih
      .catch(err => console.error('SW install cache gagal', err))
  );
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(()=> self.clients.claim()) // ambil alih semua tab yang sedang terbuka, tanpa perlu reload manual
  );
});

// Halaman minta tahu versi cache yang aktif sekarang (dipakai index.html
// untuk menampilkan info & memastikan update benar-benar terpasang).
self.addEventListener('message', (event)=>{
  if(event.data === 'SKIP_WAITING') self.skipWaiting();
  if(event.data === 'GET_VERSION') event.ports[0]?.postMessage(CACHE_NAME);
});

self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  // Halaman HTML: SELALU coba jaringan dulu, dengan cache:'no-store' supaya
  // request ini tidak pernah dijawab dari HTTP cache browser/CDN — jadi
  // begitu ada perubahan baru di GitHub/hosting, langsung terlihat saat
  // online. Kalau gagal/offline baru pakai salinan dari cache.
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if(isHTML){
    event.respondWith(
      fetch(req, {cache:'no-store'})
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
