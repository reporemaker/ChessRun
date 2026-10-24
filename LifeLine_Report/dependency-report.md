# Dependency Report — ChessRun
Generated: 2026-10-24 (run 2026-10-24-2) · Scope: full
Ecosystems: npm (3 projects: `.`, `server/`, `sub/`) · Previous report: 2026-10-24 · Baseline: [2026-10-24](baseline-2026-10-24.md)

## Summary

- **Çalışma anında dışarıdan gelen kod yalnızca React.** Oyunun (`.`) ve panelin (`sub/`)
  tarayıcıya giden paketleri `react`, `react-dom` 19.3.1 ve onların bağımlılığı `scheduler` — 3
  paket. Geri kalan her şey geliştirme/derleme aracı.
- **Projeyi rehin tutan bağımlılıklar:** `react`/`react-dom` (iki arayüzün temeli), `vite` +
  `typescript` (derleme), `wrangler` (sunucunun bütün araç zinciri) ve Cloudflare (barındırma,
  veritabanı, kimlik doğrulama).
- **Bu çalıştırmada:** ChessRun 1.1.1 ile bütün paketler aralıkları içinde güncellendi;
  **22 bilinen açık kapandı** (aşağıda, bulunma ve kapanma tarihleriyle). Kendi sunduğumuz yazı
  tipleri artık lisans metinleriyle birlikte ve `VENDORED.md`'de kayıtlı.
- Bakımsız, deprecated, arşivli ya da kurulum betiği taşıyan doğrudan bağımlılık **yok**.
  Yerleşik karşılığı olan mikro paket **yok**.

## Context Map

**Ekosistemler**

| Proje | Manifest | Lock | Çalışma anı | Ne |
|---|---|---|---|---|
| oyun | `package.json` | `package-lock.json` (v3) | 3 paket | React + Vite, chessrun.app (Cloudflare Pages) |
| sunucu | `server/package.json` | `server/package-lock.json` (v3) | 0 | Cloudflare Worker `chessrun-stats` |
| panel | `sub/package.json` | `sub/package-lock.json` (v3) | 3 paket | React + Vite, 1403.chessrun.app (Worker assets) |

CI iş akışı, Dockerfile, devcontainer: **yok**. Yayın elle yapılıyor.

**Modüller**

- `src/` — oyun arayüzü ve motoru (`engine/`, `ui/`, `components/`)
- `shared/` — oyun, panel ve sunucunun ortak kodu; `@shared/*` takma adıyla içeri alınıyor
  (`tsconfig.app.json`, `vite.config.ts`) — **dış paket değil**
- `server/src/` — Worker: toplama, sıralama, paylaşım, panel API'si, cron
- `sub/src/` — yönetim paneli
- `scripts/browser-check.cjs` — elle çalıştırılan tarayıcı denetimi (CI'ye bağlı değil)

**Modül → dış paket haritası** (import sayısı)

| Modül | Dış paketler |
|---|---|
| `src/` | `react` (26), `vitest` (21, testler), `react-dom` (2) |
| `shared/` | — |
| `server/src/` | `vitest` (3, testler); çalışma anında dış paket yok, yalnızca Workers çalışma ortamı |
| `server/scripts/` | yalnızca Node yerleşikleri (`node:fs`, `node:path`, `node:os`, `node:child_process`) |
| `sub/src/` | `react` (7), `react-dom` (1) |
| `scripts/` | `playwright-core` (1) — betiğin başında yazan sabit sürümle (1.64.1) ayrı kuruluyor |
| kök yapılandırma | `vite`, `@vitejs/plugin-react`, `vitest` |

## External Code Inventory

**Paketler** (doğrudan; sürüm = kurulu)

| Package | Version | Projects | Direct? | Used? | License | Last release | Risk signals | Criticality |
|---|---|---|---|---|---|---|---|---|
| react | 19.3.1 | oyun, panel | direct (runtime) | yes (33 dosya) | MIT | 2026-10 (19.3.1) | — | HIGH |
| react-dom | 19.3.1 | oyun, panel | direct (runtime) | yes (giriş noktası) | MIT | 2026-10 (19.3.1) | — | HIGH |
| vite | 8.3.5 | oyun, panel | dev | yes (derleme) | MIT | 2026-10 (8.3.5) | — | HIGH |
| typescript | 6.0.3 | hepsi | dev | yes (derleme, `tsc -b`) | Apache-2.0 | 2026-07 (7.0.2) | `~6.0` — 7.x büyük sürüm dışarıda | HIGH |
| wrangler | 4.152.0 | sunucu | dev | yes (dev, deploy, migrate, types, backup) | Apache-2.0 OR MIT | 2026-10 (4.152.0) | — | HIGH |
| vitest | 4.1.12 | hepsi | dev | yes (oyun, sunucu); panelde test dosyası yok | MIT | 2026-10 (5.0.5) | — | MED |
| @vitejs/plugin-react | 6.1.2 | oyun, panel | dev | yes (vite config) | MIT | 2026-10 (6.1.2) | — | MED |
| oxlint | 1.89.0 | hepsi | dev | yes (lint) | MIT | 2026-10 (1.89.0) | — | LOW |
| @types/node, @types/react, @types/react-dom | 24.19.2 / 19.3.0 / 19.3.0 | oyun, panel | dev | yes (tipler) | MIT | 2026-09/10 | — | LOW |

Çalışma anı dolaylı bağımlılığı: `scheduler` 0.28.0 (React'in), MIT, sağlıklı.

**Araç zinciri**

| Araç | Nerede |
|---|---|
| wrangler | Pages yayını (oyun), Worker yayını, D1 göçleri ve yedek — hepsi `server/`'daki kilitli sürümle |
| playwright-core 1.64.1 | `scripts/browser-check.cjs` (elle çalıştırılan tarayıcı denetimi) |
| Node.js | yerel; `engines` alanı yok |

**Varlıklar (assets)**

| Dosya | Ne | Kaynak | Lisans |
|---|---|---|---|
| `public/fonts/press-start-2p-latin*.woff2` (2) | Press Start 2P yazı tipi | Google Fonts | SIL OFL 1.1 — metin: `public/fonts/OFL-PressStart2P.txt` |
| `public/fonts/vt323-latin*.woff2` (2) | VT323 yazı tipi | Google Fonts | SIL OFL 1.1 — metin: `public/fonts/OFL-VT323.txt` |

CDN'den yüklenen betik, stil ya da yazı tipi **yok** — her şey kendi alan adından sunuluyor.

**Bulgular**

- 🟡 **Panel `vitest` bildiriyor ve `npm test` betiği var, ama `sub/` altında test dosyası yok.**
  `vitest run` test bulamayınca hata verir; kök `npm run check` panel testlerini çalıştırmıyor.
- ⚪ `oxlint` 1.89 yeni React kuralları getirdi: lint uyarıları 1'den 22'ye çıktı (hepsi uyarı,
  hata değil; `npm run check` geçiyor).
- ⚪ `typescript` 7 ve `vitest` 5 büyük sürümleri çıkmış; mevcut aralıklar bunları almıyor (bilinçli).
- ⚪ npm'deki "tek bakımcı" görünümü (`@types/*`, `oxlint`, `wrangler`) kurumsal hesaplardan
  geliyor (DefinitelyTyped, Oxc, Cloudflare); gerçek bir tek-kişi riski değil.
- ⚪ React artık npm'e CI'dan (GitHub Actions, trusted publishing) yayımlanıyor.
- ⚪ Kurulum betiği taşıyan paketler yalnızca geliştirme ağacında: `fsevents` (3 proje),
  `esbuild` ve `workerd` (sunucu). Üçü de yaygın, beklenen ikili indiricileri.

## External Services

| Service | Referenced in | Credential |
|---|---|---|
| Cloudflare Pages (`chessrun` projesi) | elle yayın, `public/_headers`, `_redirects` | Cloudflare hesabı |
| Cloudflare Workers (`chessrun-stats`) | `server/wrangler.toml`: `/collect/*`, `/lb/*`, `/s/*`, `1403.chessrun.app` | Cloudflare hesabı |
| Cloudflare D1 (`chessrun`) | `env.DB` | binding |
| Cloudflare KV (`SALT`) | `env.SALT` | binding |
| Cloudflare Rate Limiting | `env.LB_LIMIT`, `env.COLLECT_LIMIT` | binding |
| Cloudflare Access | `server/src/access.ts` | evet |
| Worker secret | `env.DAILY_SECRET` | evet |
| Cron (`5 0 * * *`) | `wrangler.toml` | — |
| Paylaşım hedefleri: x.com, facebook.com, t.me, wa.me | `src/ui/share.ts` | hayır (yalnızca giden bağlantı) |
| remaker.ch, smartkraft.ch, github.com | `Home.tsx`, `about.html` | hayır (yalnızca bağlantı) |

## Recommendations

Hepsi öneri; uygulanması proje sahibinin kararı.

| Konu | Verdict | Neden | Maliyet |
|---|---|---|---|
| Panel `vitest` | **decide** — panel testleri gelecekse kalsın (gerekirse `--passWithNoTests`), gelmeyecekse kaldır | ölü bağımlılık ya da kırık `npm test` | çok düşük |
| Yeni lint uyarıları | **review** — 22 React uyarısına bir kez bakılsın | çoğu gerçek bir yeniden çizim sorununa işaret edebilir | düşük |

**Vendoring:** aday yok. Çalışma anındaki tek dış kod React; o bir framework, kopyalanmaz.
`replacements.md`'deki yerleşik karşılığı olan hiçbir paket kullanılmıyor.

Baseline'daki **yazı tipi** önerisi uygulandı (OFL metinleri + `VENDORED.md`).

## Vendor Tracking

| Entry | Recorded | Latest upstream | Status | Local |
|---|---|---|---|---|
| retro-fonts (Press Start 2P, VT323) | Google Fonts subsets, 2026-08-23 | — | unchecked — Google Fonts'un makinece okunur sürümü yok; yılda bir elle karşılaştırılır | unchanged (checksum eşleşiyor) |

## Closed vulnerabilities

Responsible disclosure: these were found by LifeLine and are fixed now. 22 advisories,
found 2026-10-24 and closed 2026-10-24 by the ChessRun 1.1.1 dependency update.

| Advisory | Package | Project | Found | Closed | Days open |
|---|---|---|---|---|---|
| GHSA-587h-7wmj-h5pm | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-698v-4r3x-3vcv | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-9jrq-w75r-8gcw | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-r825-w8mm-5pxw | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rq7h-c2jc-7f22 | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-vfpm-58rq-9qcg | vite | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-82fw-gwwq-j7x9 | vitest, @vitest/mocker | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-qxg6-89mg-rqv8 | @vitest/mocker | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-68fv-2mgg-jv7q | source-map-js | `.`, `server`, `sub` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rgj7-g3m4-5g8c | sharp | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-wq5f-xc86-pv6w | sharp | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-2gqq-gqf2-x968 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-2jfj-6hjv-fm6j | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-3wwx-pv8p-q78v | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-3xpg-4rpp-hhhm | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-8436-99hf-9mmv | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-pmjh-fq2x-6v4x | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-r53p-7pc4-xj5r | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rfgv-xxqx-mfg5 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-rx4f-c7p8-82vq | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |
| GHSA-w293-vg96-wgc3 | undici | `server` | 2026-10-24 | 2026-10-24 | 0 |

All of them were in development tools (dev server, test runner, local Worker runtime);
none was part of what chessrun.app or the panel serve to users.

## Changes since last report

- 22 bilinen açık kapandı (yukarıda).
- Doğrudan bağımlılıklar aralıkları içinde güncellendi: react/react-dom 19.2.8 → 19.3.1,
  vite 8.2.1 → 8.3.5, vitest 4.1.10 → 4.1.12, wrangler 4.123.0 → 4.152.0, oxlint 1.78.0 → 1.89.0,
  @vitejs/plugin-react 6.0.5 → 6.1.2 ve tipler; ayrıca 222 dolaylı geliştirme paketi.
- Yeni: `VENDORED.md` kaydı (`retro-fonts`), OFL lisans metinleri.
- Önemli (🔴) değişiklik yok: el değiştirme, yeni kurulum betiği, lisans değişikliği görülmedi.
- Ayrıntı: [changes/2026-10-24-2-changes.md](changes/2026-10-24-2-changes.md) · uzun görünüm: [timeline.md](timeline.md)

## Limits of This Analysis

- Dinamik import'lar (`import()` değişkenle, `require` hesaplanmış yolla) izlenmedi.
- Kurulu sürümler `npm ls` ile, dolaylı ağaç kilit dosyalarından okundu; npm'in kendi aracı
  mevcuttu, tahmin yok.
- Bilinen açık taraması `npm audit` ve OSV ile yapıldı.
- Yazı tiplerinin lisansı Google Fonts deposundaki OFL metinlerinden alındı; `woff2`
  üstverisi `fontTools` olmadan okunamadı.
- `upstream-health.sh`'nin "maintainers" alanı npm hesabı sayar; kurumsal hesapların arkasındaki
  gerçek kişi sayısını göstermez.
- İki çalıştırma aynı gün yapıldı (açıkları kapatmadan önce ve sonra); zaman çizelgesindeki
  adımlar bu yüzden saatler, aylar değil.
- `nogit/`, `dist/`, `node_modules/` taranmadı.

## Sensitive report

A sensitive report was produced in this run. It is not part of this repository and is
delivered to the customer outside GitHub.

Generated: 2026-10-24 (run 2026-10-24-2) · sha256: c70e62457faa94867671bb554a33e295e284ef6bd553d5c1800d0f50a94cbd5e
