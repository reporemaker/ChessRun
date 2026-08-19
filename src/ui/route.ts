/**
 * Oyun adresleri - yol tabanlı, yalnızca istemci.
 *
 *   /                → ana sayfa
 *   /play/classic    → Av
 *   /play/kingRun    → Kaçış
 *   /play/trio       → Üçlü
 *   /daily           → Günün Mücadelesi
 *
 * Neden yol (hash değil): Cloudflare Pages `404.html` olmadığı için bilinmeyen
 * yola `index.html` veriyor (canlıda doğrulandı: /play/classic → 200), SW
 * gezinmeleri yoldan bağımsız saklıyor, Worker rotaları (/collect /s /lb)
 * çakışmıyor. Altyapıda sıfır değişiklik. REZERVE yollar: /collect /s /lb
 * /assets /sw.js /manifest.webmanifest /play /daily - bkz. public/_headers
 * ve server/wrangler.toml notları. public/'e ASLA 404.html koyma.
 *
 * Pencereler (ayarlar, rozetler, sıralama, Hakkında/Nasıl oynanır) adres
 * almaz - kapanır, sayfa değildir. Paylaşım linki `/?g=…` ayrı kavram: ana
 * sayfada kart vurgusu; doğrudan oyun adresi bilinçli olarak farklı.
 */
import type { GameMode } from '../engine/types'

export type PlayMode = Exclude<GameMode, 'daily'>
export type Route = { kind: 'home' } | { kind: 'play'; mode: PlayMode } | { kind: 'daily' }

const PLAY_MODES: readonly PlayMode[] = ['classic', 'kingRun', 'trio']

/** Yol → rota. Bilinmeyen yol `null`: çağıran ana sayfaya düşer ve adresi düzeltir. */
export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return { kind: 'home' }
  const head = parts[0].toLowerCase()
  if (head === 'daily' && parts.length === 1) return { kind: 'daily' }
  if (head === 'play' && parts.length === 2) {
    const want = parts[1].toLowerCase()
    if (want === 'daily') return { kind: 'daily' }
    const mode = PLAY_MODES.find((m) => m.toLowerCase() === want)
    if (mode) return { kind: 'play', mode }
  }
  return null
}

export function pathOf(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/'
    case 'daily':
      return '/daily'
    case 'play':
      return `/play/${route.mode}`
  }
}

/** Oyun moduna göre rota (null = ana sayfa) */
export function routeOfMode(mode: GameMode | null): Route {
  if (!mode) return { kind: 'home' }
  return mode === 'daily' ? { kind: 'daily' } : { kind: 'play', mode }
}

export function sameRoute(a: Route, b: Route): boolean {
  return pathOf(a) === pathOf(b)
}
