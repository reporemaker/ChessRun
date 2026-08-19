import { describe, expect, it } from 'vitest'
import { parseRoute, pathOf, routeOfMode, sameRoute } from './route'

describe('route - oyun adresleri', () => {
  it('kök ana sayfa; bölü fazlalığı fark etmez', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
    expect(parseRoute('')).toEqual({ kind: 'home' })
    expect(parseRoute('//')).toEqual({ kind: 'home' })
  })
  it('üç oyun + günlük; büyük-küçük harf ve sondaki bölü toleranslı', () => {
    expect(parseRoute('/play/classic')).toEqual({ kind: 'play', mode: 'classic' })
    expect(parseRoute('/play/kingrun/')).toEqual({ kind: 'play', mode: 'kingRun' })
    expect(parseRoute('/PLAY/Trio')).toEqual({ kind: 'play', mode: 'trio' })
    expect(parseRoute('/daily')).toEqual({ kind: 'daily' })
    expect(parseRoute('/play/daily')).toEqual({ kind: 'daily' })
  })
  it('bilinmeyen yol null - rezerve yollar dahil (onlar hiç buraya gelmemeli)', () => {
    expect(parseRoute('/foo')).toBeNull()
    expect(parseRoute('/play')).toBeNull()
    expect(parseRoute('/play/zzz')).toBeNull()
    expect(parseRoute('/play/classic/extra')).toBeNull()
    expect(parseRoute('/daily/2026-08-19')).toBeNull()
    expect(parseRoute('/lb/weekly')).toBeNull()
    expect(parseRoute('/s/')).toBeNull()
  })
  it('yol ↔ rota gidiş dönüş; modtan rota', () => {
    for (const p of ['/', '/play/classic', '/play/kingRun', '/play/trio', '/daily']) {
      const r = parseRoute(p)
      expect(r).not.toBeNull()
      expect(pathOf(r!)).toBe(p)
    }
    expect(pathOf(routeOfMode('daily'))).toBe('/daily')
    expect(pathOf(routeOfMode('trio'))).toBe('/play/trio')
    expect(pathOf(routeOfMode(null))).toBe('/')
    expect(sameRoute(routeOfMode('classic'), { kind: 'play', mode: 'classic' })).toBe(true)
  })
})
