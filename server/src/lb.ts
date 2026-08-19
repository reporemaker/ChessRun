import { MODES, type Mode, dayKeyUtc, isMode } from '../../shared/events'
import {
  AWARD_MIN_PLAYERS,
  BADGE_TIERS,
  LB_LIMITS,
  PROFILE_MAX_BYTES,
  RECOVERY_BLOB_MAX,
  RECOVERY_LOOKUP_RE,
  BURST_MAX_RUNS,
  BURST_WINDOW_MS,
  plausibleScoreMax,
  shortOf,
  type AwardsResponse,
  type BadgeTier,
  type HelloBody,
  type ProfileData,
  type ProfilePutBody,
  type ProfileResponse,
  type PulseResponse,
  type RecoveryFetchBody,
  type RecoveryFetchResponse,
  type RecoveryPutBody,
  type SubmitBody,
  type WeeklyEntry,
  type WeeklyResponse,
  type DailyResponse,
  type DailyStartBody,
  applyDailyBonus,
} from '../../shared/leaderboard'
import { hasBannedWord } from '../../shared/names'
import { isoWeekUtc, previousWeek } from '../../shared/week'
import { clampInt, str } from './validate'

export { isoWeekUtc, previousWeek, weekStartUtc } from '../../shared/week'

/**
 * Haftalık sıralama - sunucu tarafı.
 *
 * Üç uç, hepsi apex'te ve herkese açık (Access'in ARKASINDA DEĞİL):
 *   POST /lb/runs      → 204, her durumda (istatistikteki kuralla aynı: şema
 *                        sızdırmamak, istemciyi yeniden denemeye itmemek)
 *   GET  /lb/weekly    → hafta × mod tablosu; `x-chessrun-token` başlığı
 *                        gelirse kendi sıran da (listede olmasan bile)
 *   GET  /lb/pulse     → günün tahtasını kaç kişi oynadı
 *
 * Kimlik jetonun SHA-256'sı. Ham jeton bu dosyaya girip hash'lenip çıkıyor;
 * hiçbir tabloya, loga ya da cevaba yazılmıyor.
 */

/* ------------------------------------------------------------------ *
 * Saf yardımcılar - test edilebilir
 * ------------------------------------------------------------------ */

const WEEK_RE = /^\d{4}-W\d{2}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const BADGE_RE = /^[a-zA-Z]{2,24}$/

/**
 * Kabul edilen haftalar: dünkü, bugünkü, yarınki UTC haftası. İstemci
 * haftayı yerel takvime göre yazıyor; Pazartesi gece yarısının iki
 * yanındaki saat dilimi farkı bu pencereye sığıyor. Daha eskisi ya da
 * ilerisi geçmişi/geleceği yazmak demek - atılıyor.
 */
export function acceptedWeeks(nowMs: number): string[] {
  const day = 86_400_000
  return [...new Set([isoWeekUtc(nowMs - day), isoWeekUtc(nowMs), isoWeekUtc(nowMs + day)])]
}

export { shortOf }

/**
 * Ad hijyeni - istemcideki `cleanName` ile aynı kurallar, sunucuda tekrar:
 * `#` yasak (kısa jeton biçimi), kontrol/yön karakterleri gider, 24 harf,
 * rezerve adlar ve yasaklı kökler reddedilir. Geçersiz ad `null`:
 * çağıran eski adı korur ya da yer tutucu üretir.
 */
const RESERVED = ['chessrun', 'smartkraft', 'admin', 'sistem', 'system']

export function cleanName(raw: unknown, extraBanned: readonly string[] = []): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .replace(/[#\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LB_LIMITS.nameMax)
    .trim()
  if (!cleaned) return null
  const flat = cleaned.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  if (RESERVED.some((word) => flat === word || flat.startsWith(word))) return null
  if (hasBannedWord(cleaned, extraBanned)) return null
  return cleaned
}

/** Ad reddedildiğinde tabloda görünen yer tutucu - kısa jetonla ayırt ediliyor */
export function placeholderName(short: string): string {
  return `Oyuncu ${short}`
}

export interface CleanSubmit {
  token: string
  /** Temizlenmiş ad ya da null (geçersiz/yasaklı - eski ad korunur) */
  name: string | null
  /** İstemcinin yolladığı ham ad (kırpılmış) - reddedilirse panele not düşülür */
  rawName: string
  mode: Mode
  score: number
  distance: number
  cols: number
  level: number
  at: string
  week: string
  daily: string | null
  badge: string | null
  badgeTier: BadgeTier | null
  /** Koşunun yerel takvim günü (çarpan için); yoksa null */
  day: string | null
}

/**
 * Beyaz-liste kelepçesi. Bilinmeyen mod, aralık dışı sayı, biçimsiz
 * hafta ya da jeton → null → 204 ve sessizlik.
 */
export function cleanSubmit(raw: unknown, nowMs: number, extraBanned: readonly string[] = []): CleanSubmit | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Partial<SubmitBody>

  const token = str(body.token, 64)
  if (token.length < 16 || !/^[a-zA-Z0-9-]+$/.test(token)) return null
  if (!isMode(body.mode)) return null

  const week = str(body.week, 8)
  if (!WEEK_RE.test(week) || !acceptedWeeks(nowMs).includes(week)) return null

  // Negatif ya da sayı olmayan skor kelepçelenmez, atılır: 0'a çekmek
  // "hiç oynamadı" ile "bozuk gönderdi"yi karıştırırdı.
  if (!nonNegative(body.score) || !nonNegative(body.distance)) return null
  const score = clampInt(body.score, 0, LB_LIMITS.scoreMax)
  const distance = clampInt(body.distance, 0, LB_LIMITS.distanceMax)
  if (score === 0 && distance === 0) return null
  // Makullük: satır başına motorun veremeyeceği kadar puan → sahte, atılır
  if (score > plausibleScoreMax(body.mode, distance)) return null

  const daily = str(body.daily, 10)
  if (daily && !acceptedDay(daily, nowMs)) return null
  const day = str(body.day, 10)

  const badge = str(body.badge, 24)
  const badgeTier = str(body.badgeTier, 8) as BadgeTier

  const atRaw = str(body.at, 32)
  const at = Number.isFinite(Date.parse(atRaw)) ? atRaw : new Date(nowMs).toISOString()

  return {
    token,
    name: cleanName(body.name, extraBanned),
    rawName: str(body.name, 40),
    mode: body.mode,
    score,
    distance,
    cols: clampInt(body.cols, LB_LIMITS.colsMin, LB_LIMITS.colsMax, LB_LIMITS.colsMax),
    level: clampInt(body.level, 0, LB_LIMITS.levelMax, 0),
    at,
    week,
    daily: daily || null,
    day: day && acceptedDay(day, nowMs) ? day : null,
    badge: BADGE_RE.test(badge) ? badge : null,
    badgeTier: BADGE_TIERS.includes(badgeTier) ? badgeTier : null,
  }
}

function nonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ------------------------------------------------------------------ *
 * D1
 * ------------------------------------------------------------------ */

let wordsCache: { at: number; words: string[] } | null = null

/** Panelden gelen ek yasaklı kelimeler; izole başına 5 dk önbellek */
export async function bannedWords(db: D1Database, nowMs: number): Promise<string[]> {
  if (wordsCache && nowMs - wordsCache.at < 5 * 60_000) return wordsCache.words
  const rows = await db.prepare(`SELECT word FROM lb_banned_word`).all<{ word: string }>()
  const words = rows.results.map((r) => r.word)
  wordsCache = { at: nowMs, words }
  return words
}

export function invalidateWords(): void {
  wordsCache = null
}

interface PlayerState {
  name: string
  status: string
  rejected_name: string | null
  rename_day: string | null
  rename_count: number
  burst_start: number | null
  burst_count: number
}

export const TOKEN_RE = /^[a-zA-Z0-9-]{16,64}$/

/** Oyuncunun ad/rozet isteği - koşuyla ya da profil güncellemesiyle gelir */
export interface PlayerWish {
  /** Temizlenmiş ad ya da null (geçersiz/yasaklı) */
  name: string | null
  /** Ham ad - reddedilirse `last_rejected`e */
  rawName: string
  badge: string | null
  badgeTier: BadgeTier | null
}

interface PlayerResolution {
  /** Yazılacak satır (INSERT ya da UPDATE); yasaklıysa ya da dakikalık sınır aşıldıysa null */
  statement: D1PreparedStatement | null
  banned: boolean
  /** Dakikada BURST_MAX_RUNS'tan çok koşu: bu koşu yazılmaz (sessiz) */
  throttled?: boolean
  /** Sunucunun listede göstereceği ad */
  name: string
  /** İstemcinin adı bu istekte reddedildi mi (filtre / rezerve / moderatör) */
  rejected: boolean
}

/**
 * Oyuncu satırının ad/rozet kuralları - tek yer, iki çağıran (koşu ve profil):
 * - Yasaklı oyuncu: hiçbir şey yazılmıyor (istemci farkı görmüyor).
 * - Yeni oyuncu: ad geçerliyse o, değilse yer tutucu.
 * - Mevcut oyuncu, ad değişmiş: moderatörün reddettiği adsa yok sayılır;
 *   günlük değişiklik hakkı (3) dolduysa yok sayılır; yoksa güncellenir.
 * - Rozet her seferinde güncellenir (oyuncunun o anki seçimi).
 * - Reddedilen ham ad `last_rejected`e yazılır - panel sebebi görsün.
 */
async function resolvePlayer(
  db: D1Database,
  hash: string,
  short: string,
  wish: PlayerWish,
  nowMs: number,
  countRun: boolean,
): Promise<PlayerResolution> {
  const today = dayKeyUtc(nowMs)
  const player = await db
    .prepare(`SELECT name, status, rejected_name, rename_day, rename_count, burst_start, burst_count FROM lb_player WHERE token_hash = ?1`)
    .bind(hash)
    .first<PlayerState>()

  if (player?.status === 'banned') return { statement: null, banned: true, name: player.name, rejected: false }

  const raw = wish.rawName.trim()
  const runInc = countRun ? 1 : 0

  if (!player) {
    const rejected = raw !== '' && wish.name == null
    const name = wish.name ?? placeholderName(short)
    return {
      // OR IGNORE: aynı jetonun ilk iki isteği yarışırsa ikincisi PK'ye
      // takılıp bütün batch'i (koşuyla birlikte) düşürmesin
      statement: db
        .prepare(
          `INSERT OR IGNORE INTO lb_player (token_hash, short, name, badge, badge_tier, first_seen, last_seen, runs, last_rejected, burst_start, burst_count)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, ?6, ?7)`,
        )
        .bind(hash, short, name, wish.badge, wish.badgeTier, nowMs, runInc, rejected ? raw : null),
      banned: false,
      name,
      rejected,
    }
  }

  // Dakikalık pencere: koşu sayan isteklerde sayaç; sınır aşıldıysa bu koşu düşer
  let burstStart = player.burst_start ?? 0
  let burstCount = player.burst_count ?? 0
  if (countRun) {
    if (nowMs - burstStart < BURST_WINDOW_MS) burstCount += 1
    else {
      burstStart = nowMs
      burstCount = 1
    }
    if (burstCount > BURST_MAX_RUNS) {
      // Sayaç yine yazılsın ki panel "şüpheli" görsün; koşu yazılmasın
      await db
        .prepare(`UPDATE lb_player SET burst_start = ?2, burst_count = ?3 WHERE token_hash = ?1`)
        .bind(hash, burstStart, burstCount)
        .run()
      return { statement: null, banned: false, throttled: true, name: player.name, rejected: false }
    }
  }

  let name = player.name
  let renameDay = player.rename_day
  let renameCount = player.rename_count
  const wanted = wish.name
  // Reddedilme: filtreye takıldı (null) ya da moderatörün sıfırladığı ad
  const rejected = raw !== '' && (wanted == null || wanted === player.rejected_name)
  if (wanted && wanted !== player.name && wanted !== player.rejected_name) {
    if (renameDay !== today) {
      renameDay = today
      renameCount = 0
    }
    if (renameCount < LB_LIMITS.renamesPerDay) {
      name = wanted
      renameCount++
    }
  }
  return {
    statement: db
      .prepare(
        `UPDATE lb_player SET name = ?2, badge = ?3, badge_tier = ?4, last_seen = ?5, runs = runs + ?8,
           rename_day = ?6, rename_count = ?7,
           last_rejected = CASE WHEN ?9 IS NULL THEN last_rejected ELSE ?9 END,
           short = ?10, burst_start = ?11, burst_count = ?12
         WHERE token_hash = ?1`,
      )
      // short = ?10: eski 4+2 kısa hâl ilk yazımda 6+2'ye yenilenir (migration yok)
      .bind(hash, name, wish.badge, wish.badgeTier, nowMs, renameDay, renameCount, runInc, rejected ? raw : null, short, burstStart, burstCount),
    banned: false,
    name,
    rejected,
  }
}

/**
 * Koşunun oynandığı an (epoch ms): istemcinin `at`'i, ama sunucu saatini
 * aşamaz (ileri tarihli koşu = şimdi) ve bozuksa şimdi. Günlük çarpan ve
 * `lb_daily.ts` bunu kullanır - alım zamanını değil.
 */
export function playedAtOf(at: string, nowMs: number): number {
  const parsed = Date.parse(at)
  if (!Number.isFinite(parsed)) return nowMs
  return Math.min(parsed, nowMs)
}

/**
 * Koşuyu yazar. Sıra: tekrar koruması (`lb_run_seen`) → oyuncu satırı (ad
 * kuralları `resolvePlayer`) → haftalık TOPLAM (her koşu eklenir; runs/best
 * de tutulur) → günlük nabız.
 *
 * Haftalık lig = o hafta biriktirilen toplam puan (19 Ağustos kararı): "kim
 * en çok oynadı, en çok puan topladı". En iyi tek koşu değil.
 */
export async function submitRun(db: D1Database, clean: CleanSubmit, nowMs: number): Promise<void> {
  const hash = await hashToken(clean.token)
  const short = shortOf(clean.token)

  // Aynı koşu ikinci kez gelirse (kuyruk yeniden denemesi) toplamı şişirmesin:
  // (jeton, koşu zamanı) anahtarı bir kez girer; girmediyse bu bir tekrar.
  const seen = await db
    .prepare(`INSERT OR IGNORE INTO lb_run_seen (token_hash, at, ts) VALUES (?1, ?2, ?3)`)
    .bind(hash, clean.at, nowMs)
    .run()
  if ((seen.meta?.changes ?? 1) === 0) return

  const player = await resolvePlayer(db, hash, short, clean, nowMs, true)
  if (player.banned || !player.statement) return

  /* Günlük çarpan: günün mücadelesi DEĞİLSE ve koşunun günü verildiyse, o
     gün için oyuncunun kaydedilmiş günlük puanına bak; yalnızca mücadeleden
     SONRA OYNANAN koşulara uygulanır. Kıyas koşunun kendi zamanı (`at`,
     istemciden; sunucu saatini aşamaz) - alım zamanı değil: çevrimdışı
     kuyruktan geç gelen, mücadeleden önce oynanmış koşu bonus almasın. */
  const playedAt = playedAtOf(clean.at, nowMs)
  let score = clean.score
  if (clean.mode !== 'daily' && clean.day) {
    const bonusRow = await db
      .prepare(`SELECT score, ts FROM lb_daily WHERE daily = ?1 AND token_hash = ?2`)
      .bind(clean.day, hash)
      .first<{ score: number | null; ts: number | null }>()
    if (bonusRow?.score != null && bonusRow.ts != null && bonusRow.ts <= playedAt) {
      score = applyDailyBonus(clean.score, bonusRow.score)
    }
  }

  const statements: D1PreparedStatement[] = [player.statement]

  statements.push(
    db
      .prepare(
        `INSERT INTO lb_weekly (week, mode, token_hash, score, distance, at, ts, runs, best)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?4)
         ON CONFLICT(week, mode, token_hash) DO UPDATE SET
           score = lb_weekly.score + excluded.score,
           distance = lb_weekly.distance + excluded.distance,
           runs = lb_weekly.runs + 1,
           best = MAX(lb_weekly.best, excluded.score),
           at = excluded.at, ts = excluded.ts`,
      )
      .bind(clean.week, clean.mode, hash, score, clean.distance, clean.at, nowMs),
  )

  if (clean.daily) {
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO lb_daily (daily, token_hash) VALUES (?1, ?2)`).bind(clean.daily, hash),
    )
    // Günün mücadelesi puanı güne yazılır (günde tek koşu; tekrar gelirse en
    // iyisi kalır). `ts` = mücadelenin oynandığı an - çarpanın eşiği bu.
    if (clean.mode === 'daily') {
      statements.push(
        db
          .prepare(
            `UPDATE lb_daily SET score = MAX(COALESCE(score, 0), ?3), ts = COALESCE(ts, ?4)
             WHERE daily = ?1 AND token_hash = ?2`,
          )
          .bind(clean.daily, hash, clean.score, playedAt),
      )
    }
  }

  await db.batch(statements)
  // Aynı izoledeki bir sonraki tablo okuması taze olsun (koşu bitince oyuncu
  // hemen bakıyor; başka izolede en çok BOARD_TTL_MS gecikir)
  boardCache.delete(`${clean.week}|${clean.mode}`)
}

export interface WeeklyRow {
  name: string
  short: string
  score: number
  distance: number
  runs: number
  best: number
  badge: string | null
  badge_tier: string | null
  token_hash: string
}

export function toEntry(row: WeeklyRow, place: number): WeeklyEntry {
  return {
    place,
    name: row.name,
    token: row.short,
    score: row.score,
    distance: row.distance,
    runs: row.runs,
    best: row.best,
    badge: row.badge ?? undefined,
    badgeTier: (row.badge_tier as BadgeTier | null) ?? undefined,
  }
}

export const RANK_SQL = `
  SELECT w.token_hash, w.score, w.distance, w.runs, w.best, p.name, p.short, p.badge, p.badge_tier
  FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
  WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok'
  ORDER BY w.score DESC, w.distance DESC, w.ts ASC
  LIMIT ?3`

/**
 * Hafta tablosu. `token` (başlıktan) verilirse ve oyuncu tabloda varsa
 * `me` dolu - listede olmasa bile sırası hesaplanıyor. Gölgelenmiş
 * oyuncu (`shadow`) listede yok ama kendi `me`sini görüyor: kendisine
 * bir şey belli etmemek gölgelemenin anlamı.
 */
/**
 * Tablonun herkese ortak kısmı (liste + oyuncu sayısı + geçen hafta) izole
 * içi 10 sn önbellekte: her açılış D1'e 3 sorgu + N satır okutmasın (D1 Free
 * günde 5M satır okuma; kişisel `me` her istekte ayrıca hesaplanır).
 */
const boardCache = new Map<string, { at: number; body: WeeklyResponse }>()
const BOARD_TTL_MS = 10_000

async function boardOf(db: D1Database, week: string, mode: Mode, nowMs: number): Promise<WeeklyResponse> {
  const key = `${week}|${mode}`
  const hit = boardCache.get(key)
  if (hit && nowMs - hit.at < BOARD_TTL_MS) return hit.body
  const limit = LB_LIMITS.listLimit
  const [top, count, last] = await db.batch([
    db.prepare(RANK_SQL).bind(week, mode, limit),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
         WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok'`,
      )
      .bind(week, mode),
    db.prepare(RANK_SQL).bind(previousWeek(week), mode, 3),
  ])
  const entries = (top.results as WeeklyRow[]).map((row, i) => toEntry(row, i + 1))
  const players = (count.results[0] as { n: number } | undefined)?.n ?? 0
  const lastRows = (last.results as WeeklyRow[]).map((row, i) => toEntry(row, i + 1))
  const body: WeeklyResponse = { week, mode, entries, players }
  if (lastRows.length) body.lastWeek = { week: previousWeek(week), entries: lastRows }
  if (boardCache.size > 64) boardCache.clear()
  boardCache.set(key, { at: nowMs, body })
  return body
}

export async function weekly(db: D1Database, url: URL, token: string | null, nowMs: number): Promise<Response> {
  const modeParam = url.searchParams.get('mode')
  const mode: Mode = isMode(modeParam) ? modeParam : MODES[0]
  const weekParam = url.searchParams.get('week') ?? ''
  const week = WEEK_RE.test(weekParam) ? weekParam : isoWeekUtc(nowMs)

  // Önbellekteki gövde paylaşımlı - kişisel alan eklemeden önce kopyala
  const body: WeeklyResponse = { ...(await boardOf(db, week, mode, nowMs)) }

  if (token && token.length >= 16 && token.length <= 64) {
    const hash = await hashToken(token)
    const mine = await db
      .prepare(
        `SELECT w.score, w.distance, w.runs, w.best, w.ts, p.status FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
         WHERE w.week = ?1 AND w.mode = ?2 AND w.token_hash = ?3`,
      )
      .bind(week, mode, hash)
      .first<{ score: number; distance: number; runs: number; best: number; ts: number; status: string }>()
    if (mine && mine.status !== 'banned') {
      const ahead = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
           WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok' AND w.token_hash != ?5
             AND (w.score > ?3 OR (w.score = ?3 AND w.distance > ?4)
                  OR (w.score = ?3 AND w.distance = ?4 AND w.ts < ?6))`,
        )
        .bind(week, mode, mine.score, mine.distance, hash, mine.ts)
        .first<{ n: number }>()
      body.me = { place: (ahead?.n ?? 0) + 1, score: mine.score, distance: mine.distance, runs: mine.runs, best: mine.best }
    }
  }

  return Response.json(body, {
    headers: {
      // Kısa önbellek: tablo canlı ama her açılışta D1'e gitmesin.
      // Kişisel `me` taşıyan cevap paylaşımlı önbelleğe girmemeli.
      'cache-control': token ? 'private, max-age=15' : 'public, max-age=30',
    },
  })
}

/* ------------------------------------------------------------------ *
 * Günün Mücadelesi - tohum + tek hak
 * ------------------------------------------------------------------ */

/**
 * İstemcinin (yerel takvim) günü kabul edilir mi. Dünyada şu an hangi
 * günler "bugün" ise onlar: en batı (UTC−12) ile en doğu (UTC+14) arası.
 * Böylece "yarın"ın tohumu ancak yarın bir yerde başlayınca açılır ve
 * bir oyuncu en çok komşu günleri başlatabilir (±2 günlük eski tolerans
 * yarının tahtasını 36 saat önceden veriyordu).
 */
export function acceptedDay(day: string, nowMs: number): boolean {
  if (!DAY_RE.test(day)) return false
  const west = dayKeyUtc(nowMs - 12 * 3_600_000)
  const east = dayKeyUtc(nowMs + 14 * 3_600_000)
  return day >= west && day <= east
}

/**
 * Günün tohumu: HMAC-SHA256(secret, gün) ilk 4 bayt. Sır yoksa (yerel
 * geliştirme) gün metninin hash'i - istemcinin çevrimdışı yedeğiyle aynı
 * olması şart değil, yalnızca deterministik olması yeter.
 */
export async function dailySeed(secret: string | undefined, day: string): Promise<number> {
  const enc = new TextEncoder()
  if (!secret) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`chessrun-daily:${day}`))
    return new DataView(digest).getUint32(0)
  }
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(day))
  return new DataView(mac).getUint32(0)
}

async function dailyPlayed(db: D1Database, day: string, hash: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS x FROM lb_daily WHERE daily = ?1 AND token_hash = ?2`)
    .bind(day, hash)
    .first<{ x: number }>()
  return row != null
}

/** GET /lb/daily?day= - tohum + (jeton varsa) hak durumu */
export async function daily(db: D1Database, url: URL, token: string | null, secret: string | undefined, nowMs: number): Promise<Response> {
  const dayParam = url.searchParams.get('day') ?? ''
  const day = acceptedDay(dayParam, nowMs) ? dayParam : dayKeyUtc(nowMs)
  const seed = await dailySeed(secret, day)
  const played = token && /^[a-zA-Z0-9-]{16,64}$/.test(token) ? await dailyPlayed(db, day, await hashToken(token)) : false
  const body: DailyResponse = { day, seed, played }
  return Response.json(body, { headers: { 'cache-control': 'no-store' } })
}

/** POST /lb/daily/start - hakkı yakar; `played` çağrı öncesi durum */
export async function dailyStart(db: D1Database, raw: unknown, secret: string | undefined, nowMs: number): Promise<Response> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<DailyStartBody>
  const token = str(body.token, 64)
  const day = str(body.day, 10)
  if (token.length < 16 || !/^[a-zA-Z0-9-]+$/.test(token) || !acceptedDay(day, nowMs)) {
    return new Response('bad request', { status: 400 })
  }
  const hash = await hashToken(token)
  const played = await dailyPlayed(db, day, hash)
  if (!played) {
    await db.prepare(`INSERT OR IGNORE INTO lb_daily (daily, token_hash) VALUES (?1, ?2)`).bind(day, hash).run()
  }
  const out: DailyResponse = { day, seed: await dailySeed(secret, day), played }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } })
}

export async function pulse(db: D1Database, url: URL, nowMs: number): Promise<Response> {
  const dayParam = url.searchParams.get('day') ?? ''
  const day = DAY_RE.test(dayParam) ? dayParam : dayKeyUtc(nowMs)
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM lb_daily WHERE daily = ?1`).bind(day).first<{ n: number }>()
  const body: PulseResponse = { day, players: row?.n ?? 0 }
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=60' } })
}

/**
 * Bitmiş haftalardaki birincilikler. Hafta anahtarı dizgi olarak
 * karşılaştırılıyor (`YYYY-Www` takvim sırasıyla aynı). "Birinci" =
 * aynı hafta×modda kendisinden iyi (skor, mesafe, erkenlik) 'ok' oyuncu
 * yok VE o hafta×modda en az AWARD_MIN_PLAYERS oyuncu var. Gölgelenmiş ya
 * da yasaklı oyuncu birincilik alamaz - listede yoksa kürsüde de yok.
 */
export async function awards(db: D1Database, token: string | null, nowMs: number): Promise<Response> {
  const body: AwardsResponse = { firsts: [] }
  if (!token || !TOKEN_RE.test(token)) return Response.json(body, { status: 400 })
  const hash = await hashToken(token)
  const currentWeek = isoWeekUtc(nowMs)

  // İki kaynak: canlı tablo (son ~8 hafta) + arşiv (cron'un yazdığı ilk üçler,
  // budanmış haftalar dahil). Aynı hafta×mod ikisinde de olabilir - tekilleştir.
  const [live, archived] = await db.batch([
    db.prepare(FIRSTS_SQL).bind(hash, currentWeek, AWARD_MIN_PLAYERS),
    db
      .prepare(
        `SELECT a.week, a.mode FROM lb_award a JOIN lb_player p ON p.token_hash = a.token_hash AND p.status = 'ok'
         WHERE a.token_hash = ?1 AND a.place = 1 AND a.week < ?2`,
      )
      .bind(hash, currentWeek),
  ])
  const seen = new Set<string>()
  for (const row of [...(live.results as Array<{ week: string; mode: Mode }>), ...(archived.results as Array<{ week: string; mode: Mode }>)]) {
    const key = `${row.week}|${row.mode}`
    if (seen.has(key)) continue
    seen.add(key)
    body.firsts.push({ week: row.week, mode: row.mode })
  }
  body.firsts.sort((a, b) => (a.week === b.week ? a.mode.localeCompare(b.mode) : a.week.localeCompare(b.week)))
  return Response.json(body, { headers: { 'cache-control': 'private, max-age=300' } })
}

/** Oyuncunun canlı tablodaki birincilikleri (?1 hash, ?2 bu hafta, ?3 en az oyuncu) */
const FIRSTS_SQL = `
  SELECT w.week, w.mode FROM lb_weekly w
  JOIN lb_player me ON me.token_hash = w.token_hash AND me.status = 'ok'
  WHERE w.token_hash = ?1 AND w.week < ?2
    AND NOT EXISTS (
      SELECT 1 FROM lb_weekly o JOIN lb_player p ON p.token_hash = o.token_hash
      WHERE o.week = w.week AND o.mode = w.mode AND o.token_hash != w.token_hash AND p.status = 'ok'
        AND (o.score > w.score
             OR (o.score = w.score AND o.distance > w.distance)
             OR (o.score = w.score AND o.distance = w.distance AND o.ts < w.ts)))
    AND (SELECT COUNT(*) FROM lb_weekly c JOIN lb_player q ON q.token_hash = c.token_hash
         WHERE c.week = w.week AND c.mode = w.mode AND q.status = 'ok') >= ?3
  ORDER BY w.week, w.mode`

/* ------------------------------------------------------------------ *
 * Kalıcılık - kurtarma kodu + sunucu profili (sözleşme: shared/leaderboard)
 * ------------------------------------------------------------------ */

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/

/**
 * POST /lb/recovery - kör blob'u saklar. Jeton gövdede (sahiplik kanıtı:
 * bu jetonun kurtarma satırını yalnızca jetonu bilen yazabilir). Oyuncu
 * başına tek satır: yeni kod eskisini geçersiz kılar. Her durumda 204.
 */
/**
 * Biber: `lookup` sunucu sırrıyla bir kez daha HMAC'lenir. Sır yoksa (yerel
 * geliştirme) ham lookup - üretimde DAILY_SECRET her zaman tanımlı.
 */
export async function pepperLookup(secret: string | undefined, lookup: string): Promise<string> {
  if (!secret) return lookup
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`recovery:${lookup}`))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function recoveryPut(db: D1Database, raw: unknown, nowMs: number, secret: string | undefined): Promise<Response> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<RecoveryPutBody>
  const token = str(body.token, 64)
  const lookup = str(body.lookup, 64)
  const blob = str(body.blob, RECOVERY_BLOB_MAX + 1)
  if (!TOKEN_RE.test(token) || !RECOVERY_LOOKUP_RE.test(lookup)) return new Response(null, { status: 204 })
  if (blob.length < 24 || blob.length > RECOVERY_BLOB_MAX || !BASE64_RE.test(blob)) return new Response(null, { status: 204 })

  const hash = await hashToken(token)
  const player = await db.prepare(`SELECT status FROM lb_player WHERE token_hash = ?1`).bind(hash).first<{ status: string }>()
  // Yalnızca koşusu olan (sunucuda satırı olan) oyuncu: rastgele jetonlarla
  // sınırsız satır yazdırma yolu kapalı. Yasaklıya da aynı cevap.
  if (!player) return new Response('not found', { status: 404 })
  if (player.status === 'banned') return new Response(null, { status: 204 })

  const stored = await pepperLookup(secret, lookup)
  await db.batch([
    db.prepare(`DELETE FROM lb_recovery WHERE token_hash = ?1`).bind(hash),
    db.prepare(`INSERT OR REPLACE INTO lb_recovery (lookup, token_hash, blob, created) VALUES (?1, ?2, ?3, ?4)`).bind(stored, hash, blob, nowMs),
  ])
  return new Response(null, { status: 204 })
}

/** POST /lb/recovery/fetch - blob'u verir; yoksa 404 (yanlış kod = yok, aynı cevap) */
export async function recoveryFetch(db: D1Database, raw: unknown, secret: string | undefined): Promise<Response> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<RecoveryFetchBody>
  const lookup = str(body.lookup, 64)
  if (!RECOVERY_LOOKUP_RE.test(lookup)) return new Response('not found', { status: 404 })
  const row = await db
    .prepare(
      `SELECT r.blob, p.status FROM lb_recovery r LEFT JOIN lb_player p ON p.token_hash = r.token_hash WHERE r.lookup = ?1`,
    )
    .bind(await pepperLookup(secret, lookup))
    .first<{ blob: string; status: string | null }>()
  if (!row || row.status === 'banned') return new Response('not found', { status: 404 })
  const out: RecoveryFetchResponse = { blob: row.blob }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } })
}

interface ProfileRow {
  data: string | null
  updated: number | null
  reset_at: number | null
}

function parseProfile(text: string | null): ProfileData | null {
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as ProfileData
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function profileBody(db: D1Database, hash: string, name: string, nameRejected: boolean, dataDropped = false): Promise<ProfileResponse> {
  const row = await db.prepare(`SELECT data, updated, reset_at FROM lb_profile WHERE token_hash = ?1`).bind(hash).first<ProfileRow>()
  const out: ProfileResponse = {
    name,
    nameRejected,
    data: parseProfile(row?.data ?? null),
    updatedAt: row?.updated ?? null,
    resetAt: row?.reset_at ?? null,
  }
  if (dataDropped) out.dataDropped = true
  return out
}

/** GET /lb/profile - profil + sunucudaki ad; oyuncu yoksa 404 */
export async function profileGet(db: D1Database, token: string | null): Promise<Response> {
  if (!token || !TOKEN_RE.test(token)) return new Response('bad request', { status: 400 })
  const hash = await hashToken(token)
  const player = await db.prepare(`SELECT name, status FROM lb_player WHERE token_hash = ?1`).bind(hash).first<{ name: string; status: string }>()
  if (!player) return new Response('not found', { status: 404 })
  return Response.json(await profileBody(db, hash, player.name, false), { headers: { 'cache-control': 'no-store' } })
}

/**
 * POST /lb/profile - ad/rozet anında sunucuya (koşu beklemeden), istenirse
 * profil de. Ad kuralları koşudakiyle aynı (`resolvePlayer`); cevapta
 * sunucunun kabul ettiği ad - istemci "adın kabul edilmedi" diyebilsin.
 * Yasaklı oyuncuya da normal cevap: fark ettirmemek kuralı.
 */
/**
 * Açılış selamı (bkz. shared HelloBody): kimliği 0 koşuyla kaydeder. Yasaklıysa
 * ya da bozuksa sessiz 204. Kötüye kullanım: satır küçük, IP başına hız sınırı
 * var, 90 gün koşusuz+profilsiz kimlikler gece silinir (pruneLeague).
 */
export async function hello(db: D1Database, raw: unknown, nowMs: number, extraBanned: readonly string[]): Promise<Response> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<HelloBody>
  const token = str(body.token, 64)
  if (!TOKEN_RE.test(token)) return new Response(null, { status: 204 })
  const hash = await hashToken(token)
  const short = shortOf(token)
  const badge = str(body.badge, 24)
  const badgeTier = str(body.badgeTier, 8) as BadgeTier
  const wish: PlayerWish = {
    name: cleanName(body.name, extraBanned),
    rawName: str(body.name, 40),
    badge: BADGE_RE.test(badge) ? badge : null,
    badgeTier: BADGE_TIERS.includes(badgeTier) ? badgeTier : null,
  }
  const player = await resolvePlayer(db, hash, short, wish, nowMs, false)
  if (player.statement) await player.statement.run()
  return new Response(null, { status: 204 })
}

export async function profilePut(db: D1Database, raw: unknown, nowMs: number, extraBanned: readonly string[]): Promise<Response> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProfilePutBody>
  const token = str(body.token, 64)
  if (!TOKEN_RE.test(token)) return new Response('bad request', { status: 400 })
  const hash = await hashToken(token)
  const short = shortOf(token)
  // Oyuncu satırını yalnızca koşu açar (/lb/runs). Profil ucu bilinmeyen
  // jetona satır yazmaz: aksi hâlde rastgele jetonlarla 48 KB'lik satırlar
  // yazdırılıp D1 kotası tüketilebilirdi. Bilinmeyen → 404, istemci sessiz.
  const known = await db.prepare(`SELECT 1 AS x FROM lb_player WHERE token_hash = ?1`).bind(hash).first<{ x: number }>()
  if (!known) return new Response('not found', { status: 404 })

  const badge = str(body.badge, 24)
  const badgeTier = str(body.badgeTier, 8) as BadgeTier
  const wish: PlayerWish = {
    name: cleanName(body.name, extraBanned),
    rawName: str(body.name, 40),
    badge: BADGE_RE.test(badge) ? badge : null,
    badgeTier: BADGE_TIERS.includes(badgeTier) ? badgeTier : null,
  }
  const player = await resolvePlayer(db, hash, short, wish, nowMs, false)
  if (player.banned || !player.statement) {
    return Response.json(await profileBody(db, hash, player.name, false), { headers: { 'cache-control': 'no-store' } })
  }

  const statements: D1PreparedStatement[] = [player.statement]
  const data = body.data
  let dataDropped = false
  if (data && typeof data === 'object') {
    const text = JSON.stringify({
      badges: (data as ProfileData).badges ?? {},
      lifetime: (data as ProfileData).lifetime ?? null,
      runs: Array.isArray((data as ProfileData).runs) ? (data as ProfileData).runs : [],
    })
    // Sıfırlama kilidi: moderatör sıfırladıysa ve istemci o damgayı henüz
    // görmediyse (resetSeen eski) veri yazılmaz - habersiz cihaz eski
    // profili diriltemez. Damgayı gören istemcinin gönderimi geçer.
    const existing = await db.prepare(`SELECT reset_at FROM lb_profile WHERE token_hash = ?1`).bind(hash).first<{ reset_at: number | null }>()
    const resetSeen = typeof body.resetSeen === 'number' && Number.isFinite(body.resetSeen) ? body.resetSeen : 0
    const locked = existing?.reset_at != null && existing.reset_at > resetSeen
    if (text.length <= PROFILE_MAX_BYTES && !locked) {
      statements.push(
        db
          .prepare(
            `INSERT INTO lb_profile (token_hash, data, updated) VALUES (?1, ?2, ?3)
             ON CONFLICT(token_hash) DO UPDATE SET data = excluded.data, updated = excluded.updated`,
          )
          .bind(hash, text, nowMs),
      )
    } else dataDropped = true
  }
  await db.batch(statements)
  boardCache.clear() // ad/rozet değişti - tablolar yeniden okusun
  return Response.json(await profileBody(db, hash, player.name, player.rejected, dataDropped), { headers: { 'cache-control': 'no-store' } })
}

/* ------------------------------------------------------------------ *
 * Budama + birincilik arşivi (cron)
 *
 * Kural veri türüne göre (kullanıcı kararı, 19 Ağustos): oyuncu satırı
 * süreye göre SİLİNMEZ - 10 gün sonra dönen kaldığı yerden devam eder.
 * Şişkinlik takvim verisinde: lb_daily 35 günden eskisi, lb_weekly ~8
 * haftadan eskisi gider; gitmeden önce ilk üçler lb_award'a işlenir.
 * ------------------------------------------------------------------ */

export const WEEKLY_KEEP_WEEKS = 8
export const DAILY_KEEP_DAYS = 35

/** Bir haftanın her modundaki ilk üçünü arşive yazar (varsa üstüne) */
export async function recordAwards(db: D1Database, week: string): Promise<void> {
  const statements: D1PreparedStatement[] = [db.prepare(`DELETE FROM lb_award WHERE week = ?1`).bind(week)]
  for (const mode of MODES) {
    const [top, count] = await db.batch([
      db.prepare(RANK_SQL).bind(week, mode, 3),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
           WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok'`,
        )
        .bind(week, mode),
    ])
    const players = (count.results[0] as { n: number } | undefined)?.n ?? 0
    if (players < AWARD_MIN_PLAYERS) continue
    ;(top.results as WeeklyRow[]).forEach((row, i) => {
      statements.push(
        db
          .prepare(`INSERT INTO lb_award (week, mode, token_hash, place, score) VALUES (?1, ?2, ?3, ?4, ?5)`)
          .bind(week, mode, row.token_hash, i + 1, row.score),
      )
    })
  }
  await db.batch(statements)
}

/**
 * Cron: canlı tablodaki bitmiş haftaları arşivle, sonra eski hafta ve gün
 * satırlarını sil.
 */
export async function pruneLeague(db: D1Database, nowMs: number): Promise<{ weeks: number; days: number }> {
  const current = isoWeekUtc(nowMs)
  // Canlı tabloda duran BÜTÜN bitmiş haftalar yeniden arşivlenir (≤8 hafta ×
  // 4 mod, ucuz): geç gelen koşu ya da sonradan yasaklanan/gizlenen oyuncu
  // sıralamayı değiştirmiş olabilir - arşiv en geç bir gece içinde uyar.
  const weeks = await db
    .prepare(`SELECT DISTINCT week FROM lb_weekly WHERE week < ?1 ORDER BY week`)
    .bind(current)
    .all<{ week: string }>()
  for (const row of weeks.results) await recordAwards(db, row.week)

  const weekCutoff = isoWeekUtc(nowMs - WEEKLY_KEEP_WEEKS * 7 * 86_400_000)
  const dayCutoff = dayKeyUtc(nowMs - DAILY_KEEP_DAYS * 86_400_000)
  const [w, d] = await db.batch([
    db.prepare(`DELETE FROM lb_weekly WHERE week < ?1`).bind(weekCutoff),
    db.prepare(`DELETE FROM lb_daily WHERE daily < ?1`).bind(dayCutoff),
    // Tekrar koruması anahtarları: 35 gün yeter (kuyruk o kadar eski koşu taşımaz)
    db.prepare(`DELETE FROM lb_run_seen WHERE ts < ?1`).bind(nowMs - 35 * 86_400_000),
    // Selamla açılmış ama hiç oynamamış, profili/kurtarma kodu olmayan kimlikler: 90 gün sonra gider
    db
      .prepare(
        `DELETE FROM lb_player WHERE runs = 0 AND last_seen < ?1 AND status = 'ok'
           AND NOT EXISTS (SELECT 1 FROM lb_profile f WHERE f.token_hash = lb_player.token_hash)
           AND NOT EXISTS (SELECT 1 FROM lb_recovery r WHERE r.token_hash = lb_player.token_hash)
           AND NOT EXISTS (SELECT 1 FROM lb_weekly w WHERE w.token_hash = lb_player.token_hash)`,
      )
      .bind(nowMs - 90 * 86_400_000),
  ])
  return { weeks: w.meta.changes ?? 0, days: d.meta.changes ?? 0 }
}
