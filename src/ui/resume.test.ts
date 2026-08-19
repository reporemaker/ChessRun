import { beforeEach, describe, expect, it } from 'vitest'
import { createGame } from '../engine/game'
import { createDaily } from '../engine/daily'
import { createRng } from '../engine/random'
import { RESUME_KEY, RESUME_TTL_MS, clearResume, readResume, resumeMatches, reviveGame, saveResume, serializeGame } from './resume'
import { emptyTally } from './badges'

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

describe('resume - devam fişi', () => {
  beforeEach(() => store.clear())

  it('rng iç durumu saklanır: sürdürülen akış, kesintisiz akışla aynı', () => {
    const a = createRng(42)
    a()
    a()
    const b = createRng(42, a.state!)
    expect(b()).toBe(a())
    expect(b()).toBe(a())
  })

  it('tohumlu oyun gidiş dönüş: rng kaldığı yerden, geri kalan alanlar eşit', () => {
    const game = createGame({ mode: 'classic', playerColor: 'w', cols: 8, seed: 7 })
    game.rng()
    const back = reviveGame(JSON.parse(JSON.stringify(serializeGame(game))))
    expect(back.rng.seed).toBe(7)
    expect(back.rng()).toBe(game.rng())
    expect(back.board).toEqual(game.board)
    expect(back.squad).toEqual(game.squad)
    expect(back.score).toBe(game.score)
  })

  it('tohumsuz oyun sistem üretecine döner', () => {
    const game = createGame({ mode: 'trio', playerColor: 'w', cols: 8 })
    const back = reviveGame(serializeGame(game))
    expect(back.rng.seed).toBeNull()
    expect(back.squad.length).toBe(game.squad.length)
  })

  it('yaz / oku / sil; 30 dk sonra eskir; bozuk fiş atılır', () => {
    const game = createGame({ mode: 'classic', playerColor: 'w', cols: 8 })
    const ticket = {
      config: { mode: 'classic' as const, playerColor: 'w' as const, cols: 8 },
      data: {
        kind: 'game' as const,
        game: serializeGame(game),
        elapsedMs: 1200,
        runDay: '2026-08-19',
        dailyToday: null,
        tally: emptyTally(),
        prevType: game.playerType,
      },
    }
    saveResume(ticket, 1000)
    expect(readResume(1000 + RESUME_TTL_MS)?.data.kind).toBe('game')
    expect(readResume(1000 + RESUME_TTL_MS + 1)).toBeNull()
    expect(store.has(RESUME_KEY)).toBe(false)
    store.set(RESUME_KEY, '{"v":1')
    expect(readResume()).toBeNull()
    store.set(RESUME_KEY, JSON.stringify({ v: 1, savedAt: 5, config: {}, data: { kind: 'game', game: {} } }))
    expect(readResume(10)).toBeNull()
    saveResume(ticket, 1000)
    clearResume()
    expect(readResume(1000)).toBeNull()
  })

  it('günlük fiş: yalnızca aynı gün eşleşir; bitmiş koşu fiş olmaz', () => {
    const daily = createDaily({ seed: 3 })
    saveResume(
      {
        config: { mode: 'daily', playerColor: 'w', cols: 8, seed: 3, daily: '2026-08-19' },
        data: { kind: 'daily', game: daily, elapsedMs: 0, day: '2026-08-19' },
      },
      1000,
    )
    const t = readResume(1000)!
    expect(resumeMatches(t, 'daily', '2026-08-19')).toBe(true)
    expect(resumeMatches(t, 'daily', '2026-08-20')).toBe(false)
    expect(resumeMatches(t, 'classic')).toBe(false)
    saveResume(
      {
        config: { mode: 'daily', playerColor: 'w', cols: 8, seed: 3, daily: '2026-08-19' },
        data: { kind: 'daily', game: { ...daily, status: 'gameover' }, elapsedMs: 0, day: '2026-08-19' },
      },
      1000,
    )
    expect(readResume(1000)).toBeNull()
  })
})
