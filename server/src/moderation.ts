import {
  NAME_ACTIONS,
  type NameActionBody,
  type NamesResponse,
  type PlayerRow,
  type PlayerStatus,
  type WordsResponse,
} from '../../shared/leaderboard'
import { invalidateWords, placeholderName } from './lb'
import { str } from './validate'

/**
 * Panelin "Adlar" sayfası — Access arkasında (/api/*).
 *
 * Üç eylem, hepsi geri alınabilir:
 *   reset  → ad yer tutucuya döner, eski ad `rejected_name`e yazılır (istemci
 *            aynı adı yollamaya devam etse de kabul edilmez)
 *   shadow → listeden düşer, kendi sırasını görmeye devam eder
 *   ban    → koşuları yazılmaz
 *   clear  → status ok, rejected_name NULL
 *
 * Panel ham jetonu hiç görmüyor: satır anahtarı SHA-256 hash.
 */

interface DbPlayer {
  token_hash: string
  short: string
  name: string
  status: PlayerStatus
  badge: string | null
  runs: number
  first_seen: number
  last_seen: number
  rejected_name: string | null
}

function toRow(p: DbPlayer): PlayerRow {
  return {
    hash: p.token_hash,
    short: p.short,
    name: p.name,
    status: p.status,
    badge: p.badge,
    runs: p.runs,
    firstSeen: p.first_seen,
    lastSeen: p.last_seen,
    rejectedName: p.rejected_name,
  }
}

const COLS = `token_hash, short, name, status, badge, runs, first_seen, last_seen, rejected_name`

export async function listNames(db: D1Database, url: URL): Promise<Response> {
  const q = str(url.searchParams.get('q'), 40).trim()
  const status = str(url.searchParams.get('status'), 8)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 60) || 60))

  const where: string[] = []
  const binds: unknown[] = []
  if (q) {
    // Ad ya da kısa jeton — LIKE joker karakterleri kaçırılıyor
    binds.push(`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
    where.push(`(name LIKE ?${binds.length} ESCAPE '\\' OR short LIKE ?${binds.length} ESCAPE '\\')`)
  }
  if (status === 'shadow' || status === 'banned' || status === 'ok') {
    binds.push(status)
    where.push(`status = ?${binds.length}`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const [rows, count] = await db.batch([
    db.prepare(`SELECT ${COLS} FROM lb_player ${clause} ORDER BY last_seen DESC LIMIT ${limit}`).bind(...binds),
    db.prepare(`SELECT COUNT(*) AS n FROM lb_player ${clause}`).bind(...binds),
  ])
  const body: NamesResponse = {
    rows: (rows.results as DbPlayer[]).map(toRow),
    total: (count.results[0] as { n: number } | undefined)?.n ?? 0,
  }
  return Response.json(body)
}

export async function actOnName(db: D1Database, raw: unknown): Promise<Response> {
  const body = (raw ?? {}) as Partial<NameActionBody>
  const hash = str(body.hash, 64)
  const action = body.action
  if (!/^[a-f0-9]{64}$/.test(hash) || !NAME_ACTIONS.includes(action as never)) {
    return new Response('bad request', { status: 400 })
  }

  const player = await db
    .prepare(`SELECT ${COLS} FROM lb_player WHERE token_hash = ?1`)
    .bind(hash)
    .first<DbPlayer>()
  if (!player) return new Response('not found', { status: 404 })

  switch (action) {
    case 'reset':
      await db
        .prepare(`UPDATE lb_player SET rejected_name = ?2, name = ?3 WHERE token_hash = ?1`)
        .bind(hash, player.name, placeholderName(player.short))
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
  }

  const fresh = await db.prepare(`SELECT ${COLS} FROM lb_player WHERE token_hash = ?1`).bind(hash).first<DbPlayer>()
  return Response.json(fresh ? toRow(fresh) : null)
}

export async function getWords(db: D1Database): Promise<Response> {
  const rows = await db.prepare(`SELECT word FROM lb_banned_word ORDER BY word`).all<{ word: string }>()
  const body: WordsResponse = { words: rows.results.map((r) => r.word) }
  return Response.json(body)
}

/** Listeyi bütünüyle değiştirir — panel tek metin kutusu gönderiyor */
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
