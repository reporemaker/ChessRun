/**
 * Yerel Worker'a karşı uçtan uca: kod oluştur → başka "cihazda" geri yükle
 * → profil iner. Yalnızca CHESSRUN_E2E=1 ve wrangler dev (8787) açıkken.
 * Normal `npm test` koşusuna dahil değil (dosya adı *.e2e.ts - normal include deseni *.test.ts almıyor).
 */
import { beforeEach, describe, expect, it } from 'vitest'

// Basit localStorage taklidi - jsdom yok
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

function isoWeek(): string {
  const d = new Date()
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = u.getUTCDay() || 7
  u.setUTCDate(u.getUTCDate() + 4 - day)
  const start = Date.UTC(u.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((u.getTime() - start) / 86_400_000 + 1) / 7)
  return `${u.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

describe('kalıcılık uçtan uca', () => {
  beforeEach(() => store.clear())

  it('kod oluştur → yeni cihazda geri yükle → aynı jeton, profil iner', async () => {
    const { getIdentity, renameIdentity } = await import('./identity')
    const { createRecoveryCode, pushProfile, restoreFromCode, pullProfile, readRecoveryCode } = await import('./sync')
    const { readBadges } = await import('./badges')

    // Cihaz A
    const a = getIdentity()
    renameIdentity('Kurtarma Testi')
    localStorage.setItem('chessrun:badges', JSON.stringify({ rook: { tier: 1, at: '2026-08-18T00:00:00Z' } }))
    localStorage.setItem('chessrun:runs', JSON.stringify([{ mode: 'classic', score: 321, distance: 5, cols: 6, level: 1, at: '2026-08-18T10:00:00.000Z', week: '2026-W34' }]))
    const pushed = await pushProfile()
    // pushProfile bilinmeyen jetona 404 döner (satırı yalnızca koşu açar): önce bir koşu
    const { submitRun } = await import('./leaderboard')
    expect(pushed).toBeNull()
    await submitRun({ mode: 'classic', score: 321, distance: 5, cols: 6, level: 1, at: new Date().toISOString(), week: isoWeek() })
    const pushed2 = await pushProfile()
    expect(pushed2?.name).toBe('Kurtarma Testi')
    const created = await createRecoveryCode()
    expect(created.ok).toBe(true)
    const code = created.ok ? created.code : ''
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(readRecoveryCode()).toBe(code)

    // Cihaz B: temiz depo, kendi kimliği
    store.clear()
    // identity.ts bellek önbelleğini sıfırlamak için modülü yeniden yükle
    // (sorgu eki vite'a "başka modül" dedirtiyor; tip denetimi görmesin)
    const path = './identity?device=b'
    const fresh = (await import(/* @vite-ignore */ path)) as typeof import('./identity')
    const b = fresh.getIdentity()
    expect(b.token).not.toBe(a.token)

    const result = await restoreFromCode(code.toLowerCase())
    expect(result).toBe('ok')
    const restored = JSON.parse(localStorage.getItem('chessrun:identity')!) as { token: string; name: string }
    expect(restored.token).toBe(a.token)
    expect(restored.name).toBe('Kurtarma Testi')
    expect(readBadges().rook?.tier).toBe(1)
    expect(JSON.parse(localStorage.getItem('chessrun:runs')!)).toHaveLength(1)

    // Yanlış kod
    expect(await restoreFromCode('0000-0000-0000')).toBe('notfound')
    expect(await restoreFromCode('abc')).toBe('invalid')

    const pulled = await pullProfile()
    expect(pulled.serverName).toBe('Kurtarma Testi')
  }, 20_000)

  it('moderatör sıfırlaması: habersiz cihazın eski verisi profili diriltemez, cihaz kendini siler', async () => {
    const { getIdentity } = await import('./identity')
    const { pushProfile } = await import('./sync')
    const { readBadges } = await import('./badges')
    const id = getIdentity()
    const { submitRun } = await import('./leaderboard')
    await submitRun({ mode: 'classic', score: 5, distance: 1, cols: 6, level: 1, at: new Date().toISOString(), week: isoWeek() })
    localStorage.setItem('chessrun:badges', JSON.stringify({ rook: { tier: 1, at: '2026-08-18T00:00:00Z' } }))
    localStorage.setItem('chessrun:runs', JSON.stringify([{ mode: 'classic', score: 5, distance: 1, cols: 6, level: 1, at: '2026-08-18T11:00:00.000Z', week: '2026-W34' }]))
    const first = await pushProfile()
    expect(first?.data).not.toBeNull()

    // Panelden "başarımları sıfırla" (yerelde SKIP_ACCESS=1)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id.token))
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const act = await fetch('http://127.0.0.1:8787/api/names/act', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash, action: 'wipe' }),
    })
    expect(act.status).toBe(200)

    // Habersiz cihaz eski verisiyle gönderiyor: sunucu veriyi yazmamalı, cihaz silmeli
    const second = await pushProfile()
    expect(second?.dataDropped).toBe(true)
    expect(second?.resetAt).toBeTruthy()
    expect(readBadges()).toEqual({})
    expect(localStorage.getItem('chessrun:runs')).toBeNull()

    // Takip gönderimi (200 ms) kilidi açar: artık boş profil yazılır
    await new Promise((r) => setTimeout(r, 900))
    const res = await fetch('http://127.0.0.1:8787/lb/profile', { headers: { 'x-chessrun-token': id.token } })
    const prof = (await res.json()) as { data: { badges: unknown } | null; updatedAt: number; resetAt: number }
    expect(prof.data).not.toBeNull()
    expect(prof.data?.badges).toEqual({})
    expect(prof.updatedAt).toBeGreaterThan(prof.resetAt)
  }, 20_000)
})
