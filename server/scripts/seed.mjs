#!/usr/bin/env node
/**
 * Yerel D1'e sentetik bir ay tohumlar — paneli GERÇEK veri gelmeden
 * görebilmek için. Üretimde ASLA çalıştırılmaz (--local sabit).
 *
 * Kullanım:  node scripts/seed.mjs [gün sayısı=35]
 *
 * Deterministik: aynı tohum aynı veriyi üretir, böylece ekran görüntüleri
 * karşılaştırılabilir kalıyor. Dağılımlar gerçekçi tutuldu: hafta sonu
 * daha çok trafik, mobil ağırlıklı, TR > DE > diğer, Av en çok oynanan.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DAYS = Number(process.argv[2] ?? '35')

// mulberry32 — oyunun motoruyla aynı PRNG ailesi
let seed = 1403
const rnd = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (weights) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (const [k, w] of Object.entries(weights)) if ((r -= w) < 0) return k
  return Object.keys(weights)[0]
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const COUNTRY = { TR: 55, DE: 14, US: 8, GB: 5, FR: 4, ES: 3, NL: 3, CH: 3, XX: 5 }
const UI_LANG = { tr: 58, en: 22, de: 12, es: 4, fr: 4 }
const BROWSER = { chrome: 52, safari: 30, firefox: 8, samsung: 6, edge: 4 }
const DEVICE = { mobile: 70, desktop: 24, tablet: 6 }
const VIEWPORT = { xs: 60, sm: 14, md: 12, lg: 14 }
const REFERRER = { '': 70, 'google.com': 14, 't.co': 6, 'reddit.com': 4, 'smartkraft.ch': 6 }
const MODE = { classic: 50, kingRun: 32, trio: 18 }
const END = { lifeLost: 46, fellOff: 30, stuckOut: 12, checkmated: 12 }
const SPEED = { slow: 15, normal: 65, fast: 20 }

const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const dayKey = (d) => d.toISOString().slice(0, 10)

const lines = []
let sid = 0
for (let back = DAYS - 1; back >= 0; back--) {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() - back)
  const day = dayKey(d)
  const dow = d.getUTCDay()
  const weekend = dow === 0 || dow === 6
  // Hafif büyüme eğilimi + hafta sonu zirvesi
  const base = 40 + Math.round((DAYS - back) * 1.2) + (weekend ? 25 : 0)
  const visitors = base + int(-8, 8)

  for (let v = 0; v < visitors; v++) {
    const session = `seed-${day}-${sid++}`
    const country = pick(COUNTRY)
    const uiLang = country === 'TR' ? pick({ tr: 85, en: 15 }) : pick(UI_LANG)
    // Üç dil sinyali gerçekte ayrışır: Almanya'daki Türk kullanıcının
    // tarayıcısı de, seçimi tr; İngilizce arayüz seçen çoğunluğun
    // tarayıcısı başka dilde. Tohum bunu yansıtsın ki panelde üç kutu
    // "neden üç tane var" sorusu doğurmasın.
    const NATIVE = { TR: 'tr', DE: 'de', US: 'en', GB: 'en', FR: 'fr', ES: 'es', NL: 'nl', CH: 'de', XX: 'en' }
    const navLang = rnd() < 0.8 ? NATIVE[country] : uiLang
    const acceptLang = rnd() < 0.9 ? navLang : uiLang
    const device = pick(DEVICE)
    const os = device === 'desktop' ? pick({ windows: 55, macos: 35, linux: 10 }) : pick({ android: 58, ios: 42 })
    const browser = os === 'ios' ? 'safari' : pick(BROWSER)
    const ts = d.getTime() + int(6, 23) * 3_600_000 + int(0, 3_599_000)
    const standalone = rnd() < 0.08 ? 1 : 0

    lines.push(
      `INSERT OR IGNORE INTO visit (day, ts, visitor_hash, session_id, country, tz, ui_lang, nav_lang, accept_lang, browser, os, device, standalone, reduced_motion, touch, viewport, referrer, app_version)
       VALUES (${q(day)}, ${ts}, ${q('h' + session)}, ${q(session)}, ${q(country)}, 'Europe/Istanbul', ${q(uiLang)}, ${q(navLang)}, ${q(acceptLang)}, ${q(browser)}, ${q(os)}, ${q(device)}, ${standalone}, ${rnd() < 0.05 ? 1 : 0}, ${device === 'desktop' ? 0 : 1}, ${q(device === 'desktop' ? pick({ md: 40, lg: 60 }) : pick(VIEWPORT))}, ${q(pick(REFERRER))}, '1.0');`,
    )

    // %62'si oynuyor; oynayan 1–6 koşu
    if (rnd() < 0.62) {
      const runs = int(1, 6)
      let t = ts
      for (let r = 0; r < runs; r++) {
        const mode = pick(MODE)
        const dur = Math.round(Math.exp(int(0, 100) / 100 * 2.2 + 3.4) * 1000) // ~30s–8dk, sağa çarpık
        const distance = int(2, mode === 'kingRun' ? 40 : 30)
        t += dur + int(3_000, 20_000)
        lines.push(
          `INSERT INTO run_event (day, ts, session_id, mode, daily, score, distance, cols, level, duration_ms, end_reason, kings, best_streak, stuck_used, mated, speed, country, ui_lang, device, app_version)
           VALUES (${q(day)}, ${t}, ${q(session)}, ${q(mode)}, ${rnd() < 0.2 ? 1 : 0}, ${distance * int(1, 4) + int(0, 30)}, ${distance}, ${pick({ 4: 20, 6: 30, 8: 50 })}, ${1 + Math.floor(distance / 8)}, ${dur}, ${q(pick(END))}, ${rnd() < 0.15 ? int(1, 3) : 0}, ${int(0, 4)}, ${rnd() < 0.3 ? int(1, 3) : 0}, ${rnd() < 0.1 ? 1 : 0}, ${q(pick(SPEED))}, ${q(country)}, ${q(uiLang)}, ${q(device)}, '1.0');`,
        )
      }
      lines.push(
        `INSERT OR REPLACE INTO session_event (day, ts, session_id, duration_ms, runs, country, device)
         VALUES (${q(day)}, ${t}, ${q(session)}, ${t - ts + int(5_000, 60_000)}, ${runs}, ${q(country)}, ${q(device)});`,
      )
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'chessrun-seed-'))
const file = join(dir, 'seed.sql')
writeFileSync(file, lines.join('\n'))
console.log(`${lines.length} satır → ${file}`)

execFileSync('npx', ['wrangler', 'd1', 'execute', 'chessrun', '--local', '--file', file], {
  stdio: 'inherit',
  cwd: new URL('..', import.meta.url).pathname,
})
console.log('tohumlandı. Worker açıkken geçmişi topla:  curl "http://127.0.0.1:8787/api/rollup?from=<ilk gün>&to=<dün>"')
