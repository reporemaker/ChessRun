import { MODES, isMode } from '../../shared/events'
import {
  type BadgeTier,
  LB_LIMITS,
  NAME_ACTIONS,
  ORPHAN_AFTER_MS,
  type LeagueBoard,
  type LeagueResponse,
  type NameActionBody,
  type NamesResponse,
  type PlayerRow,
  type PlayerStatus,
  type WordsResponse,
} from '../../shared/leaderboard'
import { RANK_SQL, invalidateWords, isoWeekUtc, placeholderName, toEntry, type WeeklyRow } from './lb'
import { str } from './validate'

/**
 * Panelin "Adlar" sayfası - Access arkasında (/api/*).
 *
 * Dört geri alınabilir eylem:
 *   reset  → ad yer tutucuya döner, eski ad `rejected_name`e yazılır (istemci
 *            aynı adı yollamaya devam etse de kabul edilmez)
 *   shadow → listeden düşer, kendi sırasını görmeye devam eder
 *   ban    → koşuları yazılmaz
 *   clear  → status ok, rejected_name NULL
 * İki geri alınamaz eylem (panel onay istiyor):
 *   wipe   → başarımları sıfırla: ad + rozet + skorlar + birincilikler +
 *            profil gider; `lb_profile.reset_at` dolar → cihaz da siler
 *   delete → oyuncunun tüm lb_* satırları gider (öksüz kimlik temizliği)
 *
 * Panel ham jetonu hiç görmüyor: satır anahtarı SHA-256 hash.
 */

interface DbPlayer {
  token_hash: string
  short: string
  name: string
  status: PlayerStatus
  badge: string | null
  badge_tier: BadgeTier | null
  runs: number
  first_seen: number
  last_seen: number
  rejected_name: string | null
  last_rejected: string | null
  reset_at: number | null
  firsts: number
  recovery: number
}

function toRow(p: DbPlayer): PlayerRow {
  return {
    hash: p.token_hash,
    short: p.short,
    name: p.name,
    status: p.status,
    badge: p.badge,
    badgeTier: p.badge_tier,
    runs: p.runs,
    firstSeen: p.first_seen,
    lastSeen: p.last_seen,
    rejectedName: p.rejected_name,
    lastRejected: p.last_rejected,
    resetAt: p.reset_at,
    firsts: p.firsts,
    recovery: p.recovery > 0,
  }
}

/* Alt sorgular satır başına: oyuncu sayısı küçük (yüzler), panel sayfası
   200 satırla sınırlı - JOIN karmaşasına değmez. */
const COLS = `p.token_hash, p.short, p.name, p.status, p.badge, p.badge_tier, p.runs, p.first_seen, p.last_seen, p.rejected_name, p.last_rejected,
  (SELECT reset_at FROM lb_profile f WHERE f.token_hash = p.token_hash) AS reset_at,
  (SELECT COUNT(*) FROM lb_award a WHERE a.token_hash = p.token_hash AND a.place = 1) AS firsts,
  (SELECT COUNT(*) FROM lb_recovery r WHERE r.token_hash = p.token_hash) AS recovery`

export async function listNames(db: D1Database, url: URL, nowMs: number): Promise<Response> {
  const q = str(url.searchParams.get('q'), 40).trim()
  const status = str(url.searchParams.get('status'), 8)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 60) || 60))

  const where: string[] = []
  const binds: unknown[] = []
  if (q) {
    // Ad ya da kısa jeton - LIKE joker karakterleri kaçırılıyor
    binds.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
    where.push(`(p.name LIKE ?${binds.length} ESCAPE '\\' OR p.short LIKE ?${binds.length} ESCAPE '\\')`)
  }
  if (status === 'shadow' || status === 'banned' || status === 'ok') {
    binds.push(status)
    where.push(`p.status = ?${binds.length}`)
  } else if (status === 'orphan') {
    // Öksüz adayı: 1 yıldır koşu yok VE hiç birincilik yok. Elle silinir,
    // otomatik değil - sunucu "dönmeyecek" ile "ara verdi"yi ayırt edemez.
    binds.push(nowMs - ORPHAN_AFTER_MS)
    where.push(`p.last_seen < ?${binds.length} AND NOT EXISTS (SELECT 1 FROM lb_award a WHERE a.token_hash = p.token_hash AND a.place = 1)`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows, count] = await db.batch([
    db.prepare(`SELECT ${COLS} FROM lb_player p ${clause} ORDER BY p.last_seen DESC LIMIT ${limit}`).bind(...binds),
    db.prepare(`SELECT COUNT(*) AS n FROM lb_player p ${clause}`).bind(...binds),
  ])
  const body: NamesResponse = {
    rows: (rows.results as DbPlayer[]).map(toRow),
    total: (count.results[0] as { n: number } | undefined)?.n ?? 0,
  }
  return Response.json(body)
}

export async function actOnName(db: D1Database, raw: unknown, nowMs: number): Promise<Response> {
  const body = (raw ?? {}) as Partial<NameActionBody>
  const hash = str(body.hash, 64)
  const action = body.action
  if (!/^[a-f0-9]{64}$/.test(hash) || !NAME_ACTIONS.includes(action as never)) {
    return new Response('bad request', { status: 400 })
  }

  const player = await db
    .prepare(`SELECT ${COLS} FROM lb_player p WHERE p.token_hash = ?1`)
    .bind(hash)
    .first<DbPlayer>()
  if (!player) return new Response('not found', { status: 404 })

  switch (action) {
    case 'reset':
      await db
        .prepare(`UPDATE lb_player SET rejected_name = ?2, name = ?3 WHERE token_hash = ?1`)
        // İkinci sıfırlamada ad zaten yer tutucu: asıl reddedilen ad unutulmasın
        .bind(hash, player.rejected_name ?? player.name, placeholderName(player.short))
        .run()
      break
    case 'shadow':
      await db.prepare(`UPDATE lb_player SET status = 'shadow' WHERE token_hash = ?1`).bind(hash).run()
      break
    case 'ban':
      await db.prepare(`UPDATE lb_player SET status = 'banned' WHERE token_hash = ?1`).bind(hash).run()
      break
    case 'clear':
      await db
        .prepare(`UPDATE lb_player SET status = 'ok', rejected_name = NULL WHERE token_hash = ?1`)
        .bind(hash)
        .run()
      break
    case 'wipe':
      // Ad yer tutucuya (eski ad reddedilir), rozet düşer, skorlar ve
      // birincilikler gider, profil boşalır ve reset_at dolar - cihaz bir
      // sonraki profil okumasında yerelini de siler. Durum (gizli/yasaklı)
      // KORUNUR: sıfırlama ceza, af değil. Kurtarma kodu da düşer.
      await db.batch([
        db
          .prepare(`UPDATE lb_player SET name = ?2, rejected_name = ?3, badge = NULL, badge_tier = NULL WHERE token_hash = ?1`)
          .bind(hash, placeholderName(player.short), player.rejected_name ?? player.name),
        db.prepare(`DELETE FROM lb_weekly WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_award WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_recovery WHERE token_hash = ?1`).bind(hash),
        db
          .prepare(
            `INSERT INTO lb_profile (token_hash, data, updated, reset_at) VALUES (?1, NULL, ?2, ?2)
             ON CONFLICT(token_hash) DO UPDATE SET data = NULL, updated = excluded.updated, reset_at = excluded.reset_at`,
          )
          .bind(hash, nowMs),
      ])
      break
    case 'delete':
      await db.batch([
        db.prepare(`DELETE FROM lb_weekly WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_daily WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_award WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_recovery WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_profile WHERE token_hash = ?1`).bind(hash),
        db.prepare(`DELETE FROM lb_player WHERE token_hash = ?1`).bind(hash),
      ])
      return Response.json(null)
  }

  const fresh = await db.prepare(`SELECT ${COLS} FROM lb_player p WHERE p.token_hash = ?1`).bind(hash).first<DbPlayer>()
  return Response.json(fresh ? toRow(fresh) : null)
}

/**
 * GET /api/league?week= - haftanın üç ligi, panelde. Oyundaki tabloyla aynı
 * SQL (RANK_SQL) ve aynı sınır: panel oyuncunun gördüğünü görsün.
 */
export async function league(db: D1Database, url: URL, nowMs: number): Promise<Response> {
  const weekParam = url.searchParams.get('week') ?? ''
  const week = /^\d{4}-W\d{2}$/.test(weekParam) ? weekParam : isoWeekUtc(nowMs)
  const modeParam = url.searchParams.get('mode')
  const modes = isMode(modeParam) ? [modeParam] : MODES
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? LB_LIMITS.listLimit) || LB_LIMITS.listLimit))

  const boards: LeagueBoard[] = []
  for (const mode of modes) {
    const [top, count] = await db.batch([
      db.prepare(RANK_SQL).bind(week, mode, limit),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM lb_weekly w JOIN lb_player p ON p.token_hash = w.token_hash
           WHERE w.week = ?1 AND w.mode = ?2 AND p.status = 'ok'`,
        )
        .bind(week, mode),
    ])
    boards.push({
      mode,
      players: (count.results[0] as { n: number } | undefined)?.n ?? 0,
      entries: (top.results as WeeklyRow[]).map((row, i) => toEntry(row, i + 1)),
    })
  }
  const body: LeagueResponse = { week, boards }
  return Response.json(body)
}

export async function getWords(db: D1Database): Promise<Response> {
  const rows = await db.prepare(`SELECT word FROM lb_banned_word ORDER BY word`).all<{ word: string }>()
  const body: WordsResponse = { words: rows.results.map((r) => r.word) }
  return Response.json(body)
}

/** Listeyi bütünüyle değiştirir - panel tek metin kutusu gönderiyor */
export async function setWords(db: D1Database, raw: unknown, nowMs: number): Promise<Response> {
  const list = (raw as { words?: unknown } | null)?.words
  if (!Array.isArray(list)) return new Response('bad request', { status: 400 })
  const words = [
    ...new Set(
      list
        .filter((w): w is string => typeof w === 'string')
        .map((w) => w.trim().toLowerCase().slice(0, 32))
        .filter((w) => w.length >= 3),
    ),
  ].slice(0, 500)

  await db.batch([
    db.prepare(`DELETE FROM lb_banned_word`),
    ...words.map((w) => db.prepare(`INSERT INTO lb_banned_word (word, added) VALUES (?1, ?2)`).bind(w, nowMs)),
  ])
  invalidateWords()
  const body: WordsResponse = { words }
  return Response.json(body)
}
