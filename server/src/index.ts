import { dayKeyUtc, type Device } from '../../shared/events'
import { verifyAccess } from './access'
import { awards, bannedWords, cleanSubmit, pulse, submitRun, weekly } from './lb'
import { actOnName, getWords, listNames, setWords } from './moderation'
import { breakdown, pruneRaw, rollupDay, series, summary } from './api'
import { addDays } from './period'
import { currentSalt, hashVisitor, rotateSalt } from './salt'
import {
  MAX_BODY_BYTES,
  acceptLang,
  cleanRun,
  cleanSession,
  cleanVisit,
  countryCode,
  isBot,
  looksAutomated,
  parseAgent,
  str,
} from './validate'

/**
 * ChessRun istatistik Worker'ı.
 *
 * Tek betik, iki alan adı:
 *   apex/collect/*        herkese açık toplama — oyunla AYNI ORIGIN
 *   apex/lb/*             haftalık sıralama — herkese açık, Access'in ARKASINDA DEĞİL
 *   stats.<alan>/*        panel + /api/* — Cloudflare Access arkasında
 *
 * Aynı origin olması tesadüf değil, planın en önemli yönlendirme kararı:
 * `sendBeacon` preflight yapamaz, çapraz origin'de oturum olayları iOS'ta
 * sessizce kaybolur. Aynı origin'de CORS diye bir şey yok.
 *
 * Toplama uçları HER DURUMDA 204 dönüyor — doğrulama başarısız olsa bile.
 * Şema şeklini sızdırmamak ve istemciyi yeniden denemeye itmemek için.
 */

export interface Env {
  DB: D1Database
  SALT: KVNamespace
  /** Panelin alan adı; yönlendirme bununla ayrılıyor */
  STATS_HOST?: string
  /** Yerel geliştirmede Access doğrulaması atlanıyor */
  SKIP_ACCESS?: string
  ACCESS_TEAM?: string
  ACCESS_AUD?: string
}

const NO_CONTENT = { status: 204 } as const

function noContent(): Response {
  return new Response(null, NO_CONTENT)
}

/** Gövde ayrıştırmadan ÖNCE boyut kapısı — en ucuz koruma */
async function readBody(request: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > max) return null

  const text = await request.text()
  if (text.length > max) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

interface RequestFacts {
  country: string
  tz: string
  acceptLang: string
  ua: string
  browser: string
  os: string
  device: Device
  ip: string
}

function factsOf(request: Request): RequestFacts {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf
  const ua = request.headers.get('user-agent') ?? ''
  const agent = parseAgent(ua)
  return {
    // Ülke ve saat dilimi Cloudflare'dan bedava geliyor — GeoIP veritabanı
    // yok, IP saklamaya gerek yok. Şehir BİLEREK alınmıyor: şehir +
    // tarayıcı + işletim sistemi + saat dilimi bir haneyi tekilleştirir.
    country: countryCode(cf?.country as string | undefined),
    tz: str(cf?.timezone, 64),
    acceptLang: acceptLang(request.headers.get('accept-language')),
    ua,
    browser: agent.browser,
    os: agent.os,
    device: agent.device,
    ip: request.headers.get('cf-connecting-ip') ?? '',
  }
}

/* ------------------------------------------------------------------ *
 * Toplama
 * ------------------------------------------------------------------ */

async function collectVisit(request: Request, env: Env, host: string): Promise<Response> {
  const body = await readBody(request)
  const clean = cleanVisit(body, host)
  const facts = factsOf(request)
  if (!clean || isBot(facts.ua)) return noContent()
  if (looksAutomated({ ...facts, touch: clean.touch })) return noContent()

  const now = Date.now()
  const day = dayKeyUtc(now)
  const salt = await currentSalt(env.SALT)
  const hash = await hashVisitor(salt, facts.ip, facts.ua)

  // Gün başına tek satır. Tek IP'den gelen sel de tek satır üretiyor,
  // yani ziyaretçi şişirmesi zaten burada sınırlanıyor.
  await env.DB.prepare(
    `INSERT INTO visit (day, ts, visitor_hash, session_id, country, tz, ui_lang, nav_lang,
       accept_lang, browser, os, device, standalone, reduced_motion, touch, viewport,
       referrer, app_version)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
     ON CONFLICT(day, visitor_hash) DO NOTHING`,
  )
    .bind(
      day,
      now,
      hash,
      clean.sessionId,
      facts.country,
      facts.tz,
      clean.uiLang,
      clean.navLang,
      facts.acceptLang,
      facts.browser,
      facts.os,
      facts.device,
      clean.standalone ? 1 : 0,
      clean.reducedMotion ? 1 : 0,
      clean.touch ? 1 : 0,
      clean.viewport,
      clean.referrer,
      clean.appVersion,
    )
    .run()

  return noContent()
}

async function collectRun(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  const clean = cleanRun(body)
  const facts = factsOf(request)
  if (!clean || isBot(facts.ua) || looksAutomated(facts)) return noContent()

  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO run_event (day, ts, session_id, mode, daily, score, distance, cols, level,
       duration_ms, end_reason, kings, best_streak, stuck_used, mated, speed, country,
       ui_lang, device, app_version)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`,
  )
    .bind(
      dayKeyUtc(now),
      now,
      clean.sessionId,
      clean.mode,
      clean.daily ? 1 : 0,
      clean.score,
      clean.distance,
      clean.cols,
      clean.level,
      clean.durationMs,
      clean.endReason,
      clean.kings,
      clean.bestStreak,
      clean.stuckUsed,
      clean.mated ? 1 : 0,
      clean.speed,
      facts.country,
      clean.uiLang,
      facts.device,
      clean.appVersion,
    )
    .run()

  return noContent()
}

async function collectSession(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  const clean = cleanSession(body)
  const facts = factsOf(request)
  if (!clean || isBot(facts.ua) || looksAutomated(facts)) return noContent()

  const now = Date.now()
  // Aynı oturum için son beacon kazanıyor: sekme birkaç kez gizlenip
  // geri gelirse en uzun/en güncel süre kalsın.
  await env.DB.prepare(
    `INSERT INTO session_event (day, ts, session_id, duration_ms, runs, country, device)
     VALUES (?1,?2,?3,?4,?5,?6,?7)
     ON CONFLICT(session_id) DO UPDATE SET
       ts = excluded.ts,
       duration_ms = MAX(session_event.duration_ms, excluded.duration_ms),
       runs = MAX(session_event.runs, excluded.runs)`,
  )
    .bind(
      dayKeyUtc(now),
      now,
      clean.sessionId,
      clean.durationMs,
      clean.runs,
      facts.country,
      facts.device,
    )
    .run()

  return noContent()
}

/* ------------------------------------------------------------------ *
 * Yönlendirme
 * ------------------------------------------------------------------ */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path.startsWith('/collect/')) {
      if (request.method !== 'POST') return noContent()
      try {
        if (path === '/collect/visit') return await collectVisit(request, env, url.hostname)
        if (path === '/collect/run') return await collectRun(request, env)
        if (path === '/collect/session') return await collectSession(request, env)
      } catch {
        // Yazma başarısız olsa bile istemciye 204 dönüyoruz: istatistik
        // kaybı kabul edilebilir, oyunun etkilenmesi değil. Hata Workers
        // observability'ye düşüyor.
        return noContent()
      }
      return noContent()
    }

    if (path.startsWith('/lb/')) {
      // Sıralama apex'te ve herkese açık — Access'in arkasına GİRMEMELİ.
      // Yazma ucu istatistikle aynı kuralı taşıyor: her durumda 204.
      const now = Date.now()
      try {
        if (path === '/lb/runs') {
          if (request.method !== 'POST') return noContent()
          const clean = cleanSubmit(await readBody(request), now, await bannedWords(env.DB, now))
          if (clean) await submitRun(env.DB, clean, now)
          return noContent()
        }
        if (request.method !== 'GET') return new Response('method', { status: 405 })
        if (path === '/lb/weekly') return await weekly(env.DB, url, request.headers.get('x-chessrun-token'), now)
        if (path === '/lb/pulse') return await pulse(env.DB, url, now)
        if (path === '/lb/awards') return await awards(env.DB, request.headers.get('x-chessrun-token'), now)
      } catch {
        if (path === '/lb/runs') return noContent()
        return new Response('unavailable', { status: 503 })
      }
      return new Response('not found', { status: 404 })
    }

    if (path.startsWith('/api/')) {
      // Çift kilit: Access rotanın önünde, ama Worker da doğruluyor —
      // yanlış bir rota ya da workers.dev sızıntısı veriyi açmasın.
      if (env.SKIP_ACCESS !== '1') {
        const who = env.ACCESS_TEAM && env.ACCESS_AUD
          ? await verifyAccess(request, env.ACCESS_TEAM, env.ACCESS_AUD)
          : null
        if (!who) return new Response('forbidden', { status: 403 })
      }

      // Moderasyon uçları yazıyor; geri kalan her şey salt okunur
      if (request.method === 'POST') {
        if (path === '/api/names/act') return await actOnName(env.DB, await readBody(request))
        if (path === '/api/words') return await setWords(env.DB, await readBody(request, 32_768), Date.now())
        return new Response('method', { status: 405 })
      }
      if (request.method !== 'GET') return new Response('method', { status: 405 })

      if (path === '/api/names') return await listNames(env.DB, url)
      if (path === '/api/words') return await getWords(env.DB)
      if (path === '/api/health') return Response.json(await health(env))
      // Yalnızca yerel: geçmiş günleri elle topla (tohum verisi için).
      // SKIP_ACCESS üretimde asla 1 olmayacağı için orada yok sayılır.
      if (path === '/api/rollup' && env.SKIP_ACCESS === '1') {
        const from = url.searchParams.get('from') ?? addDays(dayKeyUtc(Date.now()), -1)
        const to = url.searchParams.get('to') ?? addDays(dayKeyUtc(Date.now()), -1)
        let n = 0
        for (let day = from; day <= to; day = addDays(day, 1)) {
          await rollupDay(env.DB, day)
          n++
        }
        return Response.json({ rolled: n, from, to })
      }
      if (path === '/api/summary') return json(await summary(env.DB, url))
      if (path === '/api/series') return json(await series(env.DB, url))
      if (path === '/api/breakdown') return json(await breakdown(env.DB, url))
      return new Response('not found', { status: 404 })
    }

    return new Response('not found', { status: 404 })
  },

  /**
   * 00:05 UTC. Sıra önemli: önce tuz döner (bugünün ziyaretleri yeni
   * tuzla), sonra DÜN toplanır (artık yeni satır gelmiyor), sonra 35 günü
   * aşan ham satırlar gider. Toplamlar kalıyor — "yıllık"ı mümkün kılan
   * onlar.
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await rotateSalt(env.SALT)
    const today = dayKeyUtc(Date.now())
    await rollupDay(env.DB, addDays(today, -1))
    await pruneRaw(env.DB, today)
  },
}

function json(body: unknown): Response {
  return body instanceof Response ? body : Response.json(body)
}

async function health(env: Env) {
  const rollup = await env.DB.prepare(`SELECT MAX(day) AS d FROM daily_totals`).first<{
    d: string | null
  }>()
  const raw = await env.DB.prepare(`SELECT COUNT(*) AS n, MIN(day) AS oldest FROM run_event`).first<{
    n: number
    oldest: string | null
  }>()
  return {
    ok: true,
    lastRollupDay: rollup?.d ?? null,
    rawRows: raw?.n ?? 0,
    oldestRawDay: raw?.oldest ?? null,
    salted: Boolean(await env.SALT.get('salt:today')),
  }
}
