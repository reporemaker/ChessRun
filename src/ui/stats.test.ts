import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../engine/types'
import {
  type ClientEnv,
  type RunFacts,
  buildRunPayload,
  buildVisitPayload,
  endReasonOf,
  langTag,
  viewportBucket,
} from './stats'

const env: ClientEnv = {
  sessionId: 'sess-1',
  appVersion: '1.0',
  uiLang: 'tr',
  navLang: 'de',
  viewport: 'sm',
  touch: true,
  standalone: false,
  reducedMotion: false,
  referrer: 'https://example.com/bir/yol?q=gizli',
}

const facts: RunFacts = {
  mode: 'trio',
  daily: true,
  score: 420,
  distance: 17,
  cols: 6,
  level: 3,
  durationMs: 91_234.7,
  endReason: 'stuckOut',
  speed: 'fast',
  kings: 2,
  bestStreak: 4,
  stuckUsed: 1,
  mated: false,
}

describe('viewportBucket', () => {
  it('kova sınırlarını doğru ayırıyor', () => {
    expect(viewportBucket(390)).toBe('xs')
    expect(viewportBucket(479)).toBe('xs')
    expect(viewportBucket(480)).toBe('sm')
    expect(viewportBucket(899)).toBe('sm')
    expect(viewportBucket(900)).toBe('md')
    expect(viewportBucket(1399)).toBe('md')
    expect(viewportBucket(1400)).toBe('lg')
  })
})

describe('langTag', () => {
  it('bölge ekini atıp küçük harfe indiriyor', () => {
    expect(langTag('tr-TR')).toBe('tr')
    expect(langTag('EN-us')).toBe('en')
    expect(langTag('de')).toBe('de')
  })

  it('boş değerde çökmüyor', () => {
    expect(langTag('')).toBe('')
  })
})

describe('endReasonOf', () => {
  const event = (kind: GameEvent['kind']): GameEvent => ({ kind }) as GameEvent

  it('mat en spesifik sebep', () => {
    expect(endReasonOf([event('checkmated'), event('gameover')])).toBe('checkmated')
  })

  it('sıkışma hakkı bitişini can kaybından ayırıyor', () => {
    expect(endReasonOf([event('stuckOut'), event('gameover')])).toBe('stuckOut')
  })

  it('tahtadan düşmeyi yenilmekten ayırıyor', () => {
    const fell: GameEvent = { kind: 'lifeLost', reason: 'fellOff' }
    const taken: GameEvent = { kind: 'lifeLost', reason: 'captured' }
    expect(endReasonOf([fell, event('gameover')])).toBe('fellOff')
    expect(endReasonOf([taken, event('gameover')])).toBe('lifeLost')
  })

  it('mat, can kaybının önüne geçiyor — aynı turda ikisi de olabilir', () => {
    const both: GameEvent[] = [
      { kind: 'lifeLost', reason: 'captured' },
      { kind: 'checkmated' },
      { kind: 'gameover' },
    ]
    expect(endReasonOf(both)).toBe('checkmated')
  })

  it('tanınmayan bitişte other', () => {
    expect(endReasonOf([event('gameover')])).toBe('other')
  })
})

describe('buildRunPayload', () => {
  it('süreyi yuvarlıyor ve negatife düşürmüyor', () => {
    expect(buildRunPayload(facts, env).durationMs).toBe(91_235)
    expect(buildRunPayload({ ...facts, durationMs: -5 }, env).durationMs).toBe(0)
  })

  it('rozet sayaçlarını olduğu gibi taşıyor', () => {
    const payload = buildRunPayload(facts, env)
    expect(payload.kings).toBe(2)
    expect(payload.bestStreak).toBe(4)
    expect(payload.stuckUsed).toBe(1)
    expect(payload.mated).toBe(false)
  })

  it('oturum ve sürümü ortamdan alıyor', () => {
    const payload = buildRunPayload(facts, env)
    expect(payload.sessionId).toBe('sess-1')
    expect(payload.appVersion).toBe('1.0')
    expect(payload.uiLang).toBe('tr')
  })

  /**
   * Bu testin asıl işi bir alanı doğrulamak değil, bir alanın YOKLUĞUNU
   * kilitlemek. Cihaz jetonu istatistiğe girdiği an kalıcı, cihaz bazlı bir
   * davranış profili kurulmuş olur — çerezsiz sayım kararının tüm amacı
   * buydu. Birileri "kolaylık olsun" diye eklerse burada kırılsın.
   */
  it('cihaz jetonu ya da ada benzeyen hiçbir alan taşımıyor', () => {
    const keys = Object.keys(buildRunPayload(facts, env))
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('name')
    expect(keys).not.toContain('sig')
    expect(keys.some((k) => /token|ident|name|user/i.test(k))).toBe(false)
  })
})

describe('buildVisitPayload', () => {
  it('izinsiz okunan sinyalleri taşıyor', () => {
    const payload = buildVisitPayload(env)
    expect(payload.navLang).toBe('de')
    expect(payload.viewport).toBe('sm')
    expect(payload.touch).toBe(true)
    expect(payload.standalone).toBe(false)
  })

  /**
   * Bilerek toplanmayanlar. Hepsi izinsiz okunabiliyor ama hiçbir ürün
   * sorusunu cevaplamıyor; bir araya geldiklerinde tarayıcıyı tekilleştirmeye
   * yarıyorlar. Ölçüm sebebi olmayan her alan parmak izidir.
   */
  it('parmak izi alanları taşımıyor', () => {
    const keys = Object.keys(buildVisitPayload(env))
    for (const banned of ['screen', 'dpr', 'devicePixelRatio', 'cores', 'memory', 'timezone']) {
      expect(keys).not.toContain(banned)
    }
    expect(keys).not.toContain('token')
  })
})
