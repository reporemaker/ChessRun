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
    expect(renamed?.name).toBe('Gölge Vezir')
    expect(renamed?.token).toBe(first.token) // ad değişti, kimlik aynı
    expect(shortToken(first.token)).toMatch(/^\w{4}…\w{2}$/)
  })

  /**
   * Ad temizliği tekillik değil hijyen: sıralama tablosunda görünecek ad
   * kısa jetonu taklit edemesin, görünmez olamasın, resmî ada bürünemesin.
   */
  it('adı temizler: # ve görünmez karakterler gider, boşluk tekleşir, sınır 24', async () => {
    const { cleanName, NAME_MAX } = await import('./identity')
    expect(cleanName('Ahmet #f93c')).toBe('Ahmet f93c')
    expect(cleanName('Ah\u200bmet\u202e')).toBe('Ahmet')
    expect(cleanName('  çok    boşluklu   ad  ')).toBe('çok boşluklu ad')
    expect(cleanName('a'.repeat(50))?.length).toBe(NAME_MAX)
  })

  it('rezerve adları ve boş sonucu reddeder', async () => {
    const { cleanName, renameIdentity, getIdentity } = await import('./identity')
    expect(cleanName('ChessRun')).toBeNull()
    expect(cleanName('Smart Kraft 2')).toBeNull()
    expect(cleanName('chess run resmi')).toBeNull()
    expect(cleanName('###')).toBeNull()
    expect(cleanName('\u200b')).toBeNull()

    const before = getIdentity().name
    expect(renameIdentity('SmartKraft')).toBeNull()
    expect(getIdentity().name).toBe(before) // reddedilince ad değişmez
  })

  it('boş ad verilirse rastgele yeni ad üretir', async () => {
    const { renameIdentity, getIdentity } = await import('./identity')
    const before = getIdentity().name
    const fresh = renameIdentity('   ')
    expect(fresh).not.toBeNull()
    expect(fresh?.name).toBeTruthy()
    expect(fresh?.name).not.toBe(before)
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
