import { MODES, type Mode, dayKeyUtc, isMode } from '../../shared/events'
import {
  BADGE_TIERS,
  LB_LIMITS,
  type BadgeTier,
  type PulseResponse,
  type SubmitBody,
  type WeeklyEntry,
  type WeeklyResponse,
} from '../../shared/leaderboard'
import { hasBannedWord } from '../../shared/names'
import { clampInt, str } from './validate'

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

/** ISO hafta anahtarı, UTC: 2026-W33 */
export function isoWeekUtc(ms: number): string {
  const d = new Date(ms)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

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

/** ISO haftanın Pazartesi 00:00 UTC'si. 4 Ocak her zaman 1. haftadadır. */
export function weekStartUtc(week: string): number {
  const year = Number(week.slice(0, 4))
  const n = Number(week.slice(6))
  const jan4 = Date.UTC(year, 0, 4)
  const jan4Day = new Date(jan4).getUTCDay() || 7
  return jan4 - (jan4Day - 1) * 86_400_000 + (n - 1) * 7 * 86_400_000
}

/** Önceki ISO hafta — "geçen haftanın ilk üçü" için; yıl sınırını takvim çözüyor */
export function previousWeek(week: string): string {
  return isoWeekUtc(weekStartUtc(week) - 86_400_000)
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
  if (daily && (!DAY_RE.test(daily) || Math.abs(Date.parse(`${daily}T00:00:00Z`) - nowMs) > 2 * 86_400_000)) return null

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
      .bind(clean.week, clean.mode, hash, clean.score, clean.distance, clean.at, nowMs),
  )

  if (clean.daily) {
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO lb_daily (daily, token_hash) VALUES (?1, ?2)`).bind(clean.daily, hash),
    )
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

export async function pulse(db: D1Database, url: URL, nowMs: number): Promise<Response> {
  const dayParam = url.searchParams.get('day') ?? ''
  const day = DAY_RE.test(dayParam) ? dayParam : dayKeyUtc(nowMs)
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM lb_daily WHERE daily = ?1`).bind(day).first<{ n: number }>()
  const body: PulseResponse = { day, players: row?.n ?? 0 }
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=60' } })
}
