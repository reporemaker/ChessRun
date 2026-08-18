/**
 * Küçük bir çevrimdışı önbelleği.
 *
 * Derleme sırasında üretilen dosya adları hash'li olduğu için sabit bir
 * liste tutmak yerine çalışma zamanında önbelleğe alıyoruz: bir kez
 * oynadıysan oyun çevrimdışı açılır ve yeni sürüm çıktığında sessizce
 * güncellenir (gezinme isteklerinde önce ağ, sonra önbellek).
 */
// v2 (18 Ağustos): API yolları önbellek dışına alındı; eski önbellekte
// takılı /lb cevapları activate'te silinsin diye ad yükseltildi.
// v3 (19 Ağustos): manifest/ikonlar değişti (hash'siz dosyalar ancak ad
// yükseltmesiyle tazelenir); gezinme yalnızca başarılı, yönlendirmesiz
// cevabı saklar (404/5xx/opaqueredirect '/' olarak kalmasın).
const CACHE = 'chessrun-v3'

/** Canlı veri: asla önbellekten verilmez, SW hiç karışmaz */
const NETWORK_ONLY = ['/lb/', '/collect/', '/api/']

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
  // Sıralama / günlük kilit / istatistik: her zaman ağ. Aksi hâlde ilk
  // cevap önbelleğe girip sonraki tüm istekler ağa hiç çıkmıyordu
  // (kullanıcı ~10 dk gecikmeli sıralama gördü).
  if (NETWORK_ONLY.some((prefix) => url.pathname.startsWith(prefix))) return

  // Sayfa gezinmeleri: önce ağ (yeni sürümü kaçırma), düşerse önbellek
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put('/', copy))
          }
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
