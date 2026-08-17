/**
 * Tohumlanabilir rastgelelik.
 *
 * `Math.random` motorun içinden tamamen çıkarıldı: aynı tohum + aynı hamle
 * dizisi her zaman aynı oyunu üretiyor. Bunun üç karşılığı var:
 *   - günlük meydan okuma (herkes aynı tahtayı oynar),
 *   - koşuyu tekrar oynatma,
 *   - sunucuda doğrulanabilir skor (imza tek başına yetmiyor, bkz. README).
 *
 * Üreteç mulberry32: 32 bitlik durum, tek çarpma-kaydırma zinciri, iyi
 * dağılım. Kriptografik değil — burada gereken tek şey tekrarlanabilirlik.
 */
export interface Rng {
  (): number
  /** Tohum; tohumsuz (sistem) üreteçte null */
  readonly seed: number | null
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }

  return Object.assign(next, { seed: seed >>> 0 })
}

/** Tohumsuz oyunlar için sistem üreteci */
export const systemRng: Rng = Object.assign(() => Math.random(), { seed: null })

/** Metinden 32 bitlik tohum (FNV-1a) — "2026-08-16" gibi anahtarlar için */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 0 ile n-1 arası tam sayı */
export function below(rng: Rng, n: number): number {
  return Math.floor(rng() * n)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[below(rng, items.length)]
}

/** Fisher-Yates — kaynağı bozmaz */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(rng, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
