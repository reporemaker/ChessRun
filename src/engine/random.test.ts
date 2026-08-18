import { describe, expect, it } from 'vitest'
import { createRng, hashSeed, shuffled, systemRng } from './random'
import { createGame, legalMoves, playerMove, applyStuck } from './game'
import type { GameState } from './types'

/** Taş kimlikleri global sayaçtan geldiği için imzaya girmiyor */
function signature(state: GameState): string {
  return state.board
    .map((row) => row.cells.map((cell) => (cell ? `${cell.color}${cell.type}` : '.')).join(''))
    .join('/')
}

describe('üreteç', () => {
  it('aynı tohum aynı diziyi verir, farklı tohum farklısını', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)

    const draw = (rng: () => number) => Array.from({ length: 20 }, () => rng())

    expect(draw(a)).toEqual(draw(b))
    expect(draw(createRng(43))).not.toEqual(draw(createRng(42)))
    expect(c.seed).toBe(43)
    expect(systemRng.seed).toBeNull()
  })

  it('dağılım makul: 0-1 aralığında ve dörtte birlere yaklaşık eşit düşüyor', () => {
    const rng = createRng(7)
    const buckets = [0, 0, 0, 0]

    for (let i = 0; i < 40_000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      buckets[Math.floor(value * 4)]++
    }

    for (const count of buckets) {
      expect(count).toBeGreaterThan(9_000)
      expect(count).toBeLessThan(11_000)
    }
  })

  it('metin tohumu kararlı', () => {
    expect(hashSeed('2026-08-16')).toBe(hashSeed('2026-08-16'))
    expect(hashSeed('2026-08-16')).not.toBe(hashSeed('2026-08-17'))
  })

  it('karıştırma kaynağı bozmaz ve tohuma bağlı', () => {
    const source = [0, 1, 2, 3, 4, 5, 6, 7]

    expect(shuffled(createRng(5), source)).toEqual(shuffled(createRng(5), source))
    expect(source).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect([...shuffled(createRng(5), source)].sort()).toEqual(source)
  })
})

describe('oyun tekrarlanabilirliği', () => {
  /** Hamle seçimi de deterministik olmalı: her zaman ilk seçenek */
  function play(seed: number | null, turns = 50) {
    let state = createGame({ playerColor: 'w', cols: 8, seed })
    const frames = [signature(state)]

    for (let turn = 0; turn < turns && state.status === 'playing'; turn++) {
      const options = legalMoves(state)
      state = options.length === 0 ? applyStuck(state) : playerMove(state, options[0])
      frames.push(signature(state))
    }

    return { frames, score: state.score, distance: state.distance, lives: state.lives }
  }

  it('aynı tohum + aynı hamleler = birebir aynı oyun', () => {
    expect(play(12_345)).toEqual(play(12_345))
  })

  it('farklı tohum farklı oyun üretir', () => {
    expect(play(12_345).frames).not.toEqual(play(54_321).frames)
  })

  it('günlük tohum tarihten türetiliyor: aynı gün herkeste aynı tahta', () => {
    const monday = hashSeed('2026-08-17')
    expect(play(monday).frames[0]).toBe(play(monday).frames[0])
    expect(play(hashSeed('2026-08-18')).frames[0]).not.toBe(play(monday).frames[0])
  })

  it('tohumsuz oyun sistem üretecini kullanır - akış tohuma bağlı değil', () => {
    const state = createGame({ playerColor: 'w', cols: 8 })
    expect(state.seed).toBeNull()
    expect(state.rng.seed).toBeNull()
  })
})
