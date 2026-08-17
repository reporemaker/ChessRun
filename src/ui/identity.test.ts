import { beforeAll, describe, expect, it } from 'vitest'

/** Tarayıcı depolamasının bellekteki taklidi */
function installStorage(): void {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
  })
}

describe('cihaz kimliği ve imza', () => {
  beforeAll(installStorage)

  it('jeton kalıcı, ad değiştirilebilir', async () => {
    const { getIdentity, renameIdentity, shortToken } = await import('./identity')

    const first = getIdentity()
    expect(first.token).toBeTruthy()
    expect(getIdentity().token).toBe(first.token)

    const renamed = renameIdentity('Gölge Vezir')
    expect(renamed.name).toBe('Gölge Vezir')
    expect(renamed.token).toBe(first.token) // ad değişti, kimlik aynı
    expect(shortToken(first.token)).toMatch(/^\w{4}…\w{2}$/)
  })

  it('koşu imzalanır ve kurcalama imzayı bozar', async () => {
    const { runPayload, signPayload, verifyPayload, getIdentity } = await import('./identity')
    const { recordRun, readRuns } = await import('./scores')

    const run = await recordRun({ mode: 'classic', score: 42, distance: 30, cols: 8, level: 3 })
    expect(run.sig).toBeTruthy()

    const fields = (score: number) => [
      getIdentity().token, 'classic', score, run.distance, run.cols, run.level, run.at, run.week, '',
    ]

    expect(await verifyPayload(runPayload(fields(42)), run.sig!)).toBe(true)
    expect(await verifyPayload(runPayload(fields(9999)), run.sig!)).toBe(false)

    // Aynı yükün imzası kararlı olmalı (sunucu doğrulaması buna dayanıyor)
    expect(await signPayload(runPayload(fields(42)))).toBe(run.sig)

    expect(readRuns()).toHaveLength(1)
  })

  it('rekorlar ve haftalık durum defterden hesaplanır', async () => {
    const { recordRun, readStanding } = await import('./scores')

    await recordRun({ mode: 'classic', score: 10, distance: 12, cols: 6, level: 1 })
    await recordRun({ mode: 'classic', score: 88, distance: 60, cols: 8, level: 5 })

    const standing = readStanding()
    expect(standing.allTime?.score).toBe(88)
    expect(standing.thisWeek?.score).toBe(88)
    expect(standing.games).toBe(3) // önceki testin koşusu da defterde
    expect(standing.weekEndsAt.getDay()).toBe(1)
  })
})
