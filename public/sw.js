/**
 * Küçük bir çevrimdışı önbelleği.
 *
 * Derleme sırasında üretilen dosya adları hash'li olduğu için sabit bir
 * liste tutmak yerine çalışma zamanında önbelleğe alıyoruz: bir kez
 * oynadıysan oyun çevrimdışı açılır ve yeni sürüm çıktığında sessizce
 * güncellenir (gezinme isteklerinde önce ağ, sonra önbellek).
 */
const CACHE = 'chessrun-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Sayfa gezinmeleri: önce ağ (yeni sürümü kaçırma), düşerse önbellek
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    )
    return
  }

  // Varlıklar hash'li: önbellekte varsa oradan ver, yoksa ağdan alıp sakla
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
