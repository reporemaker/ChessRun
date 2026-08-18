# chessrun-stats — istatistik Worker'ı

Cloudflare Worker + D1. Tek betik, iki alan adı:

| Yol | Erişim |
|---|---|
| `chessrun.app/collect/*` | herkese açık toplama — **oyunla aynı origin** |
| `chessrun.app/lb/*` | haftalık sıralama (`POST /runs` · `GET /weekly` · `GET /pulse`) — herkese açık |
| `1403.chessrun.app/*` | panel + `/api/*` (istatistik + ad moderasyonu) — **Cloudflare Access arkasında** |

Toplamanın apex'te olması tesadüf değil. `sendBeacon` preflight yapamaz;
çapraz origin'de oturum olayları iOS'ta sessizce kaybolur. Aynı origin'de
CORS diye bir şey yok ve Worker'ın hiç CORS kodu taşıması gerekmiyor.

## Yerelde çalıştırma

```bash
cd server
npm install
npm run migrate:local     # wrangler d1 migrations apply chessrun --local
npm run dev               # 8787
```

Sonra proje kökünde `cp .env.example .env.local` ve `npm run dev`.
Vite'ın dev proxy'si `/collect`'i 8787'ye yönlendiriyor, böylece **yerel de
üretim gibi aynı origin** oluyor.

Satırları görmek için:

```bash
npx wrangler d1 execute chessrun --local --json \
  --command "SELECT mode, COUNT(*) FROM run_event GROUP BY mode"
```

## Yayına almadan önce doldurulacaklar

`wrangler.toml` içinde `PLACEHOLDER` geçen her yer:

- `database_id` ← `wrangler d1 create chessrun`
- KV `id` ← `wrangler kv namespace create SALT`
- `ACCESS_TEAM` / `ACCESS_AUD` ← Access uygulaması kurulunca (politika: Allow → Emails → `chessrun@smartkraft.ch`)


## Değişmez kurallar

- **IP hiçbir yere yazılmıyor.** Yalnızca istek işleyicisinde yerel değişken
  olarak var, günlük dönen tuzla hash'leniyor, tuz 48 saatte siliniyor.
- **Cihaz jetonu istatistiğe hiç gelmiyor.** Sıralama tablosu jetona ihtiyaç
  duyuyor çünkü o bir kimlik iddiası; istatistik duymuyor. Sıralama tarafında
  da ham jeton **yazılmıyor**: `lb_player` anahtarı SHA-256 hash, gösterim
  kısa hâl (`a1b2…9f`), cevaplar ve panel tam jetonu hiç görmüyor.
- **Sıralama sunucusu imzayı doğrulayamıyor** (anahtar cihazda) — jeton
  taşıyıcı sırdır. Savunma: hafta başına oyuncu×mod tek satır (upsert),
  beyaz-liste kelepçesi (`shared/leaderboard.ts` LB_LIMITS), hafta penceresi
  (dün/bugün/yarın), WAF hız sınırı `/lb/*`, panelden gölgeleme/yasak.
- **Ham User-Agent saklanmıyor** — üç kovaya ayrıştırılıyor.
- **Şehir alınmıyor.** Şehir + tarayıcı + işletim sistemi + saat dilimi bir
  haneyi tekilleştirir ve hiçbir ürün sorusunu cevaplamaz.
- **Toplama uçları her durumda 204 döner** — doğrulama başarısız olsa bile.
  Şema şeklini sızdırmamak ve istemciyi yeniden denemeye itmemek için.
- **`workers_dev = false` kalmalı.** Access rotanın önünde duruyor; Worker
  `*.workers.dev` üstünden erişilebilir olsaydı Access baypas edilir, tüm
  veri seti tahmin edilecek bir alan adı uzaklıkta kalırdı.

## Kapsam dışı (bilinçli)

Mail — panelde hiç olmayacak; iletişim ve Access girişi `chessrun@smartkraft.ch` üstünden.
Gerçek zamanlı görünüm, veri dışa aktarma, çoklu yönetici, geçmiş
`localStorage` verisinin aktarımı (cihaz başına tutulduğu için sunucuya
taşınamaz).
