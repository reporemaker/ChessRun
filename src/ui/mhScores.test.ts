import { beforeEach, describe, expect, it } from 'vitest'
import { type MhGrid, type MhState, newMaharajah } from '../engine/maharajah'
import { MH_SWIFT_PLIES, claimMhBadges, readBadges } from './badges'
import { applyMhResult, readMhGuide, readMhStats, recordMhResult, writeMhGuide } from './mhScores'
import { MH_RESUME_KEY, clearMhResume, readMhResume, saveMhResume } from './mhResume'
import { RESUME_TTL_MS } from './resume'

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

/** Bitmiş oyun: rol, sonuç, hamle sayısı; `armyLeft` ordudan yalnızca şah mı kaldı */
function finished(mode: 'falcon' | 'hunter', outcome: 'win' | 'loss' | 'draw', plies: number, onlyKing = false): MhState {
  const s = newMaharajah(mode)
  let board: MhGrid = s.board
  if (onlyKing) board = s.board.map((row) => row.map((p) => (p && p.t !== 'k' && p.t !== 'A' ? null : p)))
  return { ...s, board, plies, result: { outcome, reason: outcome === 'win' ? (mode === 'falcon' ? 'mate' : 'captured') : outcome === 'draw' ? 'stalemate' : 'mate' } }
}

beforeEach(() => store.clear())

describe('Mihrace rozet sayaçları', () => {
  it('yalnızca galibiyet sayılır; rol ayrı, en kısa galibiyet tutulur', () => {
    let s = readMhStats()
    s = applyMhResult(s, finished('falcon', 'loss', 10))
    s = applyMhResult(s, finished('falcon', 'draw', 10))
    expect(s.falconWins).toBe(0)
    s = applyMhResult(s, finished('falcon', 'win', 40))
    s = applyMhResult(s, finished('hunter', 'win', 18))
    expect(s).toMatchObject({ falconWins: 1, hunterWins: 1, fastestWin: 18 })
  })

  it('Temiz Tahta: Şahin bütün orduyu yiyip kazanınca; Tam Kadro: Avcı hiç taş kaybetmeden', () => {
    expect(applyMhResult(readMhStats(), finished('falcon', 'win', 30)).sweep).toBe(false)
    expect(applyMhResult(readMhStats(), finished('falcon', 'win', 30, true)).sweep).toBe(true)
    // Avcı başlangıç ordusu yerinde (39) kazanırsa
    expect(applyMhResult(readMhStats(), finished('hunter', 'win', 12)).guard).toBe(true)
    expect(applyMhResult(readMhStats(), finished('hunter', 'win', 12, true)).guard).toBe(false)
  })

  it('rozetler kademeyle verilir, aynı kademe ikinci kez gelmez', () => {
    const first = claimMhBadges(recordMhResult(finished('falcon', 'win', MH_SWIFT_PLIES)))
    expect(first.map((a) => a.id).sort()).toEqual(['mhFalcon', 'mhSwift'])
    expect(readBadges().mhFalcon?.tier).toBe(0)
    // Aynı durumda yeni kademe yok
    expect(claimMhBadges(readMhStats())).toEqual([])
    // 5. galibiyet: Şahin bronz (kademe 1)
    for (let i = 0; i < 4; i++) recordMhResult(finished('falcon', 'win', 60))
    expect(claimMhBadges(readMhStats())).toEqual([{ id: 'mhFalcon', tier: 1 }])
  })
})

describe('Mihrace kılavuz tercihi', () => {
  it('varsayılan açık; kapatınca kalır, açınca anahtar silinir', () => {
    expect(readMhGuide()).toBe(true)
    writeMhGuide(false)
    expect(readMhGuide()).toBe(false)
    expect(store.get('chessrun:mh-guide')).toBe('off')
    writeMhGuide(true)
    expect(readMhGuide()).toBe(true)
    expect(store.has('chessrun:mh-guide')).toBe(false)
  })
})

describe('Mihrace devam fişi', () => {
  const live = (plies: number): MhState => ({ ...newMaharajah('hunter'), plies })

  it('kılavuzsuz oyunun fişi kılavuzsuz sürer; eski fiş (alan yok) kılavuz açık sayılır', () => {
    saveMhResume({ game: { ...newMaharajah('falcon', false), plies: 2 }, runDay: '2026-10-24', dailyToday: null, elapsedMs: 0 }, 1_000)
    expect(readMhResume(2_000)?.game.guide).toBe(false)
    const legacy = { ...live(2) } as MhState
    delete legacy.guide
    saveMhResume({ game: legacy, runDay: '2026-10-24', dailyToday: null, elapsedMs: 0 }, 1_000)
    expect(readMhResume(2_000)?.game.guide).toBeUndefined()
  })

  it('süren oyun okunur; hamlesiz, bitmiş ya da eski fiş atılır', () => {
    saveMhResume({ game: live(3), runDay: '2026-10-23', dailyToday: null, elapsedMs: 5000 }, 1_000)
    expect(readMhResume(2_000)?.game.plies).toBe(3)
    expect(readMhResume(1_000 + RESUME_TTL_MS + 1)).toBeNull()
    expect(store.has(MH_RESUME_KEY)).toBe(false)

    saveMhResume({ game: live(0), runDay: '2026-10-23', dailyToday: null, elapsedMs: 0 }, 1_000)
    expect(readMhResume(2_000)).toBeNull()

    saveMhResume({ game: { ...live(4), result: { outcome: 'win', reason: 'captured' } }, runDay: '2026-10-23', dailyToday: null, elapsedMs: 0 }, 1_000)
    expect(readMhResume(2_000)).toBeNull()

    store.set(MH_RESUME_KEY, '{bozuk')
    expect(readMhResume()).toBeNull()
    clearMhResume()
  })
})
