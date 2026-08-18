import { beforeEach, describe, expect, it } from 'vitest'
import { IDLE_MS, claimVisit, countRun, sessionRuns, sessionStart, touchSession } from './session'

/**
 * `sessionStorage` node ortamında yok. Modül try/catch ile bozulmadan
 * çalışıyor ama 30 dakika kuralını sınamak için çalışan bir depo lazım -
 * en küçük sahtesini kuruyoruz.
 */
function installStore() {
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    },
  })
  return map
}

beforeEach(() => {
  installStore()
})

describe('touchSession', () => {
  it('ilk çağrıda yeni oturum doğuruyor', () => {
    const session = touchSession(1_000)
    expect(session.fresh).toBe(true)
    expect(session.id).toBeTruthy()
  })

  it('eşiğin altında aynı oturumu sürdürüyor', () => {
    const first = touchSession(1_000)
    const second = touchSession(1_000 + IDLE_MS - 1)
    expect(second.fresh).toBe(false)
    expect(second.id).toBe(first.id)
  })

  it('tam eşikte hâlâ aynı oturum - sınır dahil', () => {
    const first = touchSession(1_000)
    expect(touchSession(1_000 + IDLE_MS).id).toBe(first.id)
  })

  it('eşiği geçince yeni oturum doğuyor', () => {
    const first = touchSession(1_000)
    const second = touchSession(1_000 + IDLE_MS + 1)
    expect(second.fresh).toBe(true)
    expect(second.id).not.toBe(first.id)
  })

  /**
   * Hareketsizlik son DOKUNUŞTAN sayılıyor, oturumun başından değil:
   * aralıksız oynayan biri 30 dakikayı geçince oturumunu kaybetmemeli.
   */
  it('her dokunuş sayacı ileri alıyor', () => {
    const first = touchSession(0)
    let now = 0
    for (let i = 0; i < 10; i++) {
      now += IDLE_MS - 1_000
      expect(touchSession(now).id).toBe(first.id)
    }
    expect(now).toBeGreaterThan(IDLE_MS)
  })
})

describe('claimVisit', () => {
  it('oturum başına yalnızca bir kez veriyor', () => {
    touchSession(1_000)
    expect(claimVisit()).toBe(true)
    expect(claimVisit()).toBe(false)
  })

  it('yeni oturum doğunca yeniden veriyor', () => {
    touchSession(1_000)
    expect(claimVisit()).toBe(true)
    touchSession(1_000 + IDLE_MS + 1)
    expect(claimVisit()).toBe(true)
  })
})

describe('koşu sayacı', () => {
  it('sayıyor ve yeni oturumda sıfırlanıyor', () => {
    touchSession(1_000)
    expect(countRun()).toBe(1)
    expect(countRun()).toBe(2)
    expect(sessionRuns()).toBe(2)

    touchSession(1_000 + IDLE_MS + 1)
    expect(sessionRuns()).toBe(0)
  })

  it('oturum başlangıcı yeni oturumla güncelleniyor', () => {
    touchSession(1_000)
    expect(sessionStart()).toBe(1_000)
    touchSession(500_000 + IDLE_MS)
    expect(sessionStart()).toBe(500_000 + IDLE_MS)
  })
})

describe('depo kapalıyken', () => {
  it('çökmüyor, oturum sayfa yüklemesiyle sınırlı kalıyor', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('gizli sekme')
      },
    })
    expect(() => touchSession(1_000)).not.toThrow()
    expect(touchSession(1_000).fresh).toBe(true)
    expect(() => claimVisit()).not.toThrow()
  })
})
