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
// v4 (20 Ağustos): /about gerçek bir statik sayfa; gezinme cevabı artık
// yalnızca SPA yollarında '/' anahtarına yazılır, statik sayfalar kendi
// adresleriyle saklanır. Aksi hâlde /about ziyareti '/' önbelleğini
// eziyor ve çevrimdışı açılışta oyun yerine hakkında geliyordu.
const CACHE = 'chessrun-v4'

/** Gerçek statik sayfalar: SPA fallback'ine ait olmayan gezinmeler */
const STATIC_PAGES = ['/about']

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

  // Sayfa gezinmeleri: önce ağ (yeni sürümü kaçırma), düşerse önbellek.
  // SPA yolları '/' anahtarıyla tek kopya; statik sayfalar kendi adresiyle.
  if (request.mode === 'navigate') {
    const isStatic = STATIC_PAGES.some(
      (page) => url.pathname === page || url.pathname.startsWith(page + '/'),
    )
    const key = isStatic ? request : '/'
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected && response.type === 'basic') {
            const copy = response.clone()
            void caches.open(CACHE).then((cache) => cache.put(key, copy))
          }
          return response
        })
        .catch(() => caches.match(key).then((hit) => hit ?? Response.error())),
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
