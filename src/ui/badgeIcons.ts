import type { BadgeId } from './badges'

/**
 * Taş olmayan rozetlerin SVG ikonları — 24×24 kutu, `currentColor` dolgu.
 *
 * Unicode glifi tasarlanamıyor, yalnızca seçilebiliyordu; "çapraz kılıç
 * düzeltilsin" isteği ancak kendi çizimimizle karşılanabildi. Set tek
 * elden, aynı ağırlıkta; kademe rengini `currentColor`'dan alıyor, siyah
 * kademede CSS ile 1px kontur (`paint-order: stroke fill`).
 *
 * Taş rozetleri (♜♞♝♟♛♚) tahtadaki gliflerle aynı kalsın diye burada yok.
 * Seçimler 17 Ağustos 2026'da rozet.html üstünde tıklamalı yapıldı.
 *
 * `.st` sınıfı: dolgusuz, konturlu parça (halka, ok gövdesi).
 */

const sword = (rot: number) =>
  `<g transform="rotate(${rot} 12 12)"><rect x="11" y="2" width="2" height="12"/><rect x="8.4" y="13.6" width="7.2" height="1.9" rx=".4"/><rect x="11" y="15.5" width="2" height="4"/><circle cx="12" cy="20.6" r="1.4"/></g>`

const swordDown = (rot: number, x = 12) =>
  `<g transform="rotate(${rot} ${x} 12)"><circle cx="${x}" cy="3" r="1.4"/><rect x="${x - 1}" y="4" width="2" height="4"/><rect x="${x - 4}" y="8" width="8" height="1.9" rx=".4"/><polygon points="${x - 1.6},10 ${x + 1.6},10 ${x},22"/></g>`

const rays = (n: number, r1: number, r2: number, w: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<rect x="${12 - w / 2}" y="${12 - r2}" width="${w}" height="${r2 - r1}" rx="${w / 2}" transform="rotate(${(360 / n) * i} 12 12)"/>`,
  ).join('')

const pixelHeart = (() => {
  const cells: Array<[number, number]> = [
    [5, 5], [7, 5], [13, 5], [15, 5],
    [3, 7], [5, 7], [7, 7], [9, 7], [11, 7], [13, 7], [15, 7], [17, 7],
    [3, 9], [17, 9], [3, 11], [17, 11], [5, 13], [15, 13], [7, 15], [13, 15], [9, 17], [11, 17],
  ]
  return (
    cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="2.2" height="2.2"/>`).join('') +
    `<rect x="5" y="9" width="12.2" height="2.2"/><rect x="5" y="11" width="12.2" height="2.2"/><rect x="7" y="13" width="8.2" height="2.2"/><rect x="9" y="15" width="4.2" height="2.2"/>`
  )
})()

/** Rozet kimliği → SVG iç işaretlemesi. Burada olmayan rozet Unicode glifiyle çiziliyor. */
export const BADGE_ICONS: Partial<Record<BadgeId, string>> = {
  // Üç kılıç yelpaze — üç silahşör
  musketeers: `<g transform="rotate(-26 12 19)">${sword(0)}</g>${sword(0)}<g transform="rotate(26 12 19)">${sword(0)}</g>`,
  // Eğik hançer
  harakiri: swordDown(28),
  // Nişangâh: çember + dört çentik + ortada nokta
  hunter: `<circle class="st" cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.7"/><rect x="11" y="1.5" width="2" height="4.5" rx="1"/><rect x="11" y="18" width="2" height="4.5" rx="1"/><rect x="1.5" y="11" width="4.5" height="2" rx="1"/><rect x="18" y="11" width="4.5" height="2" rx="1"/>`,
  // Bayrak
  mate: `<rect x="5" y="2.5" width="2" height="19.5" rx=".6"/><path d="M7 3.5h11.5l-3.2 4.2 3.2 4.3H7z"/>`,
  // Üç dalga — nefes
  breath: `<path class="st" d="M4 7.5c3-2.5 6-2.5 8 0s5 2.5 8 0"/><path class="st" d="M4 12c3-2.5 6-2.5 8 0s5 2.5 8 0"/><path class="st" d="M4 16.5c3-2.5 6-2.5 8 0s5 2.5 8 0"/>`,
  // Takas okları
  transform: `<path class="st" d="M4 8.5h13"/><polygon points="20.5,8.5 15.5,5 15.5,12"/><path class="st" d="M20 15.5H7"/><polygon points="3.5,15.5 8.5,12 8.5,19"/>`,
  // Takvim + 7
  sevenDays: `<rect class="st" x="3.5" y="4.5" width="17" height="16" rx="1.5"/><rect x="3.5" y="4.5" width="17" height="4"/><rect x="7" y="2.5" width="2" height="4" rx=".6"/><rect x="15" y="2.5" width="2" height="4" rx=".6"/><text x="12" y="17.6" font-size="9.5" text-anchor="middle">7</text>`,
  // Takvim + 30
  thirtyDays: `<rect class="st" x="3.5" y="4.5" width="17" height="16" rx="1.5"/><rect x="3.5" y="4.5" width="17" height="4"/><rect x="7" y="2.5" width="2" height="4" rx=".6"/><rect x="15" y="2.5" width="2" height="4" rx=".6"/><text x="12" y="17.6" font-size="8.2" text-anchor="middle">30</text>`,
  // Madalya + 1
  weekFirst: `<polygon points="7.5,2 11,2 12,9 8.5,9"/><polygon points="16.5,2 13,2 12,9 15.5,9"/><circle cx="12" cy="15" r="6.5"/><text x="12" y="18.3" font-size="8.5" text-anchor="middle" class="ink">1</text>`,
  // İçe bakan oklar — daralma
  narrow: `<rect x="3" y="3" width="2.5" height="18" rx=".6"/><rect x="18.5" y="3" width="2.5" height="18" rx=".6"/><polygon points="7,8 11,12 7,16"/><polygon points="17,8 13,12 17,16"/>`,
  // Üç uçlu taç
  weekKing: `<path d="M4 17.5V8l4.2 3.8L12 5.5l3.8 6.3L20 8v9.5z"/><rect x="4" y="18.5" width="16" height="2.5" rx=".6"/>`,
  // Üçlü şerit — momentum
  chain: `<polygon points="3,5 8,12 3,19 6.5,19 11.5,12 6.5,5"/><polygon points="9,5 14,12 9,19 12.5,19 17.5,12 12.5,5"/><polygon points="15,5 20,12 15,19 18.5,19 23.5,12 18.5,5" class="dim"/>`,
  // Piksel kalp — 8-bit
  oneUp: pixelHeart,
  // Güneş tacı: taç, arkasında ışın halesi — en önemli ödül
  emperor: `${rays(12, 8.4, 11.4, 1.5)}<circle cx="12" cy="12.5" r="7.6" class="ink"/><path d="M6.8 16V10l3 2.3 2.2-4 2.2 4 3-2.3v6z"/><rect x="6.8" y="16.8" width="10.4" height="1.8" rx=".4"/>`,
}
