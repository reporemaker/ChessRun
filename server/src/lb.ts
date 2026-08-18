import { MODES, type Mode, dayKeyUtc, isMode } from '../../shared/events'
import {
  AWARD_MIN_PLAYERS,
  BADGE_TIERS,
  LB_LIMITS,
  type AwardsResponse,
  type BadgeTier,
  type PulseResponse,
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
 * Haftalık sıralama — sunucu tarafı.
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
 * Saf yardımcılar — test edilebilir
 * ------------------------------------------------------------------ */

const WEEK_RE = /^\d{4}-W\d{2}$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const BADGE_RE = /^[a-zA-Z]{2,24}$/

/**
 * Kabul edilen haftalar: dünkü, bugünkü, yarınki UTC haftası. İstemci
 * haftayı yerel takvime göre yazıyor; Pazartesi gece yarısının iki
 * yanındaki saat dilimi farkı bu pencereye sığıyor. Daha eskisi ya da
 * ilerisi geçmişi/geleceği yazmak demek — atılıyor.
 */
export function acceptedWeeks(nowMs: number): string[] {
  const day = 86_400_000
  return [...new Set([isoWeekUtc(nowMs - day), isoWeekUtc(nowMs), isoWeekUtc(nowMs + day)])]
}

export function shortOf(token: string): string {
  const clean = token.replace(/-/g, '')
  return `${clean.slice(0, 4)}…${clean.slice(-2)}`
}

/**
 * Ad hijyeni — istemcideki `cleanName` ile aynı kurallar, sunucuda tekrar:
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

/** Ad reddedildiğinde tabloda görünen yer tutucu — kısa jetonla ayırt ediliyor */
export function placeholderName(short: string): string {
  return `Oyuncu ${short}`
}

export interface CleanSubmit {
  token: string
  /** Temizlenmiş ad ya da null (geçersiz/yasaklı — eski ad korunur) */
  name: string | null
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
}

/**
 * Koşuyu yazar. Sıra: oyuncu satırı (ad kuralları burada) → haftalık en
 * iyi (upsert, yalnızca daha iyiyse) → günlük nabız.
 *
 * Ad kuralları:
 * - Yasaklı oyuncu: hiçbir şey yazılmıyor (istemci farkı görmüyor).
 * - Yeni oyuncu: ad geçerliyse o, değilse yer tutucu.
 * - Mevcut oyuncu, ad değişmiş: moderatörün reddettiği adsa yok sayılır;
 *   günlük değişiklik hakkı (3) dolduysa yok sayılır; yoksa güncellenir.
 * - Rozet her koşuda güncellenir (oyuncunun o anki seçimi).
 */
export async function submitRun(db: D1Database, clean: CleanSubmit, nowMs: number): Promise<void> {
  const hash = await hashToken(clean.token)
  const short = shortOf(clean.token)
  const today = dayKeyUtc(nowMs)

  const player = await db
    .prepare(`SELECT name, status, rejected_name, rename_day, rename_count FROM lb_player WHERE token_hash = ?1`)
    .bind(hash)
    .first<PlayerState>()

  if (player?.status === 'banned') return

  /* Günlük çarpan: günün mücadelesi DEĞİLSE ve koşunun günü verildiyse, o
     gün için oyuncunun kaydedilmiş günlük puanına bak; yalnızca mücadeleden
     SONRA gelen koşulara uygulanır (ts karşılaştırması sunucu saatiyle). */
  let score = clean.score
  if (clean.mode !== 'daily' && clean.day) {
    const bonusRow = await db
      .prepare(`SELECT score, ts FROM lb_daily WHERE daily = ?1 AND token_hash = ?2`)
      .bind(clean.day, hash)
      .first<{ score: number | null; ts: number | null }>()
    if (bonusRow?.score != null && bonusRow.ts != null && bonusRow.ts <= nowMs) {
      score = applyDailyBonus(clean.score, bonusRow.score)
    }
  }

  const statements: D1PreparedStatement[] = []

  if (!player) {
    statements.push(
      db
        .prepare(
          `INSERT INTO lb_player (token_hash, short, name, badge, badge_tier, first_seen, last_seen, runs)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 1)`,
        )
        .bind(hash, short, clean.name ?? placeholderName(short), clean.badge, clean.badgeTier, nowMs),
    )
  } else {
    let name = player.name
    let renameDay = player.rename_day
    let renameCount = player.rename_count
    const wanted = clean.name
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
    statements.push(
      db
        .prepare(
          `UPDATE lb_player SET name = ?2, badge = ?3, badge_tier = ?4, last_seen = ?5, runs = runs + 1,
             rename_day = ?6, rename_count = ?7
           WHERE token_hash = ?1`,
        )
        .bind(hash, name, clean.badge, clean.badgeTier, nowMs, renameDay, renameCount),
    )
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO lb_weekly (week, mode, token_hash, score, distance, at, ts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(week, mode, token_hash) DO UPDATE SET
           score = excluded.score, distance = excluded.distance, at = excluded.at, ts = excluded.ts
         WHERE excluded.score > lb_weekly.score
            OR (excluded.score = lb_weekly.score AND excluded.distance > lb_weekly.distance)`,
      )
      .bind(clean.week, clean.mode, hash, score, clean.distance, clean.at, nowMs),
  )

  if (clean.daily) {
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO lb_daily (daily, token_hash) VALUES (?1, ?2)`).bind(clean.daily, hash),
    )
    // Günün mücadelesi puanı güne yazılır (günde tek koşu; tekrar gelirse en iyisi kalır)
    if (clean.mode === 'daily') {
      statements.push(
        db
          .prepare(
            `UPDATE lb_daily SET score = MAX(COALESCE(score, 0), ?3), ts = COALESCE(ts, ?4)
             WHERE daily = ?1 AND token_hash = ?2`,
          )
          .bind(clean.daily, hash, clean.score, nowMs),
      )
    }
  }

  await db.batch(statements)
}

interface WeeklyRow {
  name: string
  short: string
  score: number
  distance: number
  badge: string | null
  badge_tier: string | null
  token_hash: string
}

function toEntry(row: WeeklyRow, place: number): WeeklyEntry {
  return {
    place,
    name: row.name,
    token: row.short,
    score: row.score,
    distance: row.distance,
    badge: row.badge ?? undefined,
    badgeTier: (row.badge_tier as BadgeTier | null) ?? undefined,
  }
}

const RANK_SQL = `
  SELECT w.token_hash, w.score, w.distance, p.name, p.short, p.badge, p.badge_tier
  FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
  WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok'
  ORDER BY w.score DESC, w.distance DESC, w.ts ASC
  LIMIT ?3`

/**
 * Hafta tablosu. `token` (başlıktan) verilirse ve oyuncu tabloda varsa
 * `me` dolu — listede olmasa bile sırası hesaplanıyor. Gölgelenmiş
 * oyuncu (`shadow`) listede yok ama kendi `me`sini görüyor: kendisine
 * bir şey belli etmemek gölgelemenin anlamı.
 */
export async function weekly(db: D1Database, url: URL, token: string | null, nowMs: number): Promise<Response> {
  const modeParam = url.searchParams.get('mode')
  const mode: Mode = isMode(modeParam) ? modeParam : MODES[0]
  const weekParam = url.searchParams.get('week') ?? ''
  const week = WEEK_RE.test(weekParam) ? weekParam : isoWeekUtc(nowMs)
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

  if (token && token.length >= 16 && token.length <= 64) {
    const hash = await hashToken(token)
    const mine = await db
      .prepare(
        `SELECT w.score, w.distance, w.ts, p.status FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
         WHERE w.week = ?1 AND w.mode = ?2 AND w.token_hash = ?3`,
      )
      .bind(week, mode, hash)
      .first<{ score: number; distance: number; ts: number; status: string }>()
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
      body.me = { place: (ahead?.n ?? 0) + 1, score: mine.score, distance: mine.distance }
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
 * Günün Mücadelesi — tohum + tek hak
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
 * geliştirme) gün metninin hash'i — istemcinin çevrimdışı yedeğiyle aynı
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

/** GET /lb/daily?day= — tohum + (jeton varsa) hak durumu */
export async function daily(db: D1Database, url: URL, token: string | null, secret: string | undefined, nowMs: number): Promise<Response> {
  const dayParam = url.searchParams.get('day') ?? ''
  const day = acceptedDay(dayParam, nowMs) ? dayParam : dayKeyUtc(nowMs)
  const seed = await dailySeed(secret, day)
  const played = token && /^[a-zA-Z0-9-]{16,64}$/.test(token) ? await dailyPlayed(db, day, await hashToken(token)) : false
  const body: DailyResponse = { day, seed, played }
  return Response.json(body, { headers: { 'cache-control': 'no-store' } })
}

/** POST /lb/daily/start — hakkı yakar; `played` çağrı öncesi durum */
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
 * da yasaklı oyuncu birincilik alamaz — listede yoksa kürsüde de yok.
 */
export async function awards(db: D1Database, token: string | null, nowMs: number): Promise<Response> {
  const body: AwardsResponse = { firsts: [] }
  if (!token || token.length < 16 || token.length > 64) return Response.json(body, { status: 400 })
  const hash = await hashToken(token)
  const currentWeek = isoWeekUtc(nowMs)

  const rows = await db
    .prepare(
      `SELECT w.week, w.mode FROM lb_weekly w
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
       ORDER BY w.week, w.mode`,
    )
    .bind(hash, currentWeek, AWARD_MIN_PLAYERS)
    .all<{ week: string; mode: Mode }>()

  body.firsts = rows.results
  return Response.json(body, { headers: { 'cache-control': 'private, max-age=300' } })
}
