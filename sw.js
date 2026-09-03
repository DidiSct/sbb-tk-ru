/* ============================= SERVICE WORKER — SBB TK Ruhul Ukhuwwah =============================
   Menyimpan "app shell" (halaman utama + ikon + mesin SQLite) ke Cache Storage
   milik browser, sehingga aplikasi tetap bisa dibuka walau perangkat sedang
   tanpa koneksi internet. Data sekolah sendiri (siswa, absensi, dst.) TIDAK
   disimpan di sini — itu sudah ditangani terpisah oleh IndexedDB di dalam
   index.html.

   PENTING: Service Worker hanya aktif bila situs diakses lewat HTTPS (atau
   http://localhost saat pengembangan). Menaikkan nomor CACHE_NAME di bawah
   ini akan memaksa versi cache lama dibuang dan diganti versi baru — lakukan
   ini setiap kali index.html diperbarui dan diunggah ulang ke hosting. */

const CACHE_NAME = 'sbb-tk-ru-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL.map((url) => {
          const req = new Request(url, { mode: url.startsWith('http') ? 'no-cors' : 'same-origin' });
          return cache.add(req).catch((err) => console.warn('[sw] gagal precache:', url, err));
        })
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* Strategi: "cache lalu jaringan" (cache-first, revalidate di belakang layar).
   - Kalau ada di cache -> tampilkan langsung (cepat, jalan walau offline),
     sambil tetap mengambil versi terbaru dari jaringan untuk memperbarui cache.
   - Kalau tidak ada di cache -> ambil dari jaringan, lalu simpan ke cache. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
