import type { GameEvent } from '../engine/types'

/**
 * Ses dosyası yok: her efekt WebAudio osilatörüyle anlık üretiliyor.
 *
 * Sebep sadece boyut değil — kare dalga ve sert zarflar, tahtanın
 * yanıp sönme animasyonuyla aynı 8-bit dili konuşuyor. Örneklenmiş
 * "gerçekçi" sesler bu görüntünün yanında yabancı duruyordu.
 */

interface Blip {
  /** Başlangıç frekansı (Hz) */
  freq: number
  /** Süre (saniye) */
  dur: number
  /** Bitiş frekansı — verilirse frekans kayar (slide) */
  to?: number
  type?: OscillatorType
  gain?: number
  /** Efektin başından itibaren gecikme (saniye) */
  delay?: number
}

const STORAGE_KEY = 'chessrun:muted'

let ctx: AudioContext | null = null
let muted = readMuted()

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // depolama kapalıysa ses ayarı sadece bu oturum için geçerli
  }
}

/**
 * Tarayıcılar AudioContext'i ancak kullanıcı etkileşiminden sonra
 * çalıştırıyor — ilk dokunuşta çağrılması gerekiyor.
 */
export function unlockSound(): void {
  if (muted) return
  const audio = context()
  if (audio?.state === 'suspended') void audio.resume()
}

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

function play(blips: Blip[]): void {
  if (muted) return
  const audio = context()
  if (!audio) return
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime

  for (const blip of blips) {
    const start = now + (blip.delay ?? 0)
    const osc = audio.createOscillator()
    const amp = audio.createGain()

    osc.type = blip.type ?? 'square'
    osc.frequency.setValueAtTime(blip.freq, start)
    if (blip.to != null) osc.frequency.exponentialRampToValueAtTime(blip.to, start + blip.dur)

    // Sert atak, kısa sönüm: arcade cipsi böyle davranıyordu
    const peak = blip.gain ?? 0.14
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.006)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + blip.dur)

    osc.connect(amp).connect(audio.destination)
    osc.start(start)
    osc.stop(start + blip.dur + 0.02)
  }
}

const SOUNDS = {
  move: (): void => play([{ freq: 180, dur: 0.045, type: 'triangle', gain: 0.09 }]),

  capture: (): void =>
    play([
      { freq: 420, dur: 0.06, gain: 0.13 },
      { freq: 700, dur: 0.07, gain: 0.11, delay: 0.045 },
    ]),

  transform: (): void =>
    play([
      { freq: 440, dur: 0.06, gain: 0.11 },
      { freq: 554, dur: 0.06, gain: 0.11, delay: 0.055 },
      { freq: 659, dur: 0.1, gain: 0.12, delay: 0.11 },
    ]),

  check: (): void =>
    play([
      { freq: 880, dur: 0.07, gain: 0.12 },
      { freq: 1320, dur: 0.11, gain: 0.12, delay: 0.07 },
    ]),

  mate: (): void =>
    play([
      { freq: 660, dur: 0.08, gain: 0.13 },
      { freq: 880, dur: 0.08, gain: 0.13, delay: 0.075 },
      { freq: 1180, dur: 0.16, gain: 0.14, delay: 0.15 },
    ]),

  kingBonus: (): void =>
    play([
      { freq: 523, dur: 0.07, gain: 0.14 },
      { freq: 659, dur: 0.07, gain: 0.14, delay: 0.07 },
      { freq: 784, dur: 0.07, gain: 0.14, delay: 0.14 },
      { freq: 1047, dur: 0.22, gain: 0.15, delay: 0.21 },
    ]),

  /** Tahta baştan kuruluyor: aşağı süpüren bir tarama, sonra geri açılış */
  boardRefresh: (): void =>
    play([
      { freq: 1200, to: 140, dur: 0.32, type: 'sawtooth', gain: 0.1 },
      { freq: 160, to: 900, dur: 0.3, type: 'square', gain: 0.09, delay: 0.42 },
    ]),

  lifeLost: (): void =>
    play([{ freq: 220, to: 60, dur: 0.36, type: 'sawtooth', gain: 0.16 }]),

  gameover: (): void =>
    play([
      { freq: 330, dur: 0.14, gain: 0.14 },
      { freq: 247, dur: 0.14, gain: 0.14, delay: 0.15 },
      { freq: 196, dur: 0.14, gain: 0.14, delay: 0.3 },
      { freq: 147, dur: 0.4, gain: 0.15, delay: 0.45 },
    ]),

  scroll: (): void => play([{ freq: 90, dur: 0.03, type: 'triangle', gain: 0.045 }]),
}

export type SoundName = keyof typeof SOUNDS

export function playSound(name: SoundName): void {
  SOUNDS[name]()
}

/**
 * Bir turda birden çok olay olabiliyor (yedi + dönüştü + şah çekti).
 * Hepsini üst üste çalmak gürültü oluyor; en "büyük" olay seçiliyor.
 */
const PRIORITY: Array<[GameEvent['kind'], SoundName]> = [
  ['gameover', 'gameover'],
  ['lifeLost', 'lifeLost'],
  // Üçlü: taş kaybı can kaybıyla aynı ağırlıkta duyulmalı, kadro küçülüyor
  ['pieceLost', 'lifeLost'],
  ['kingBonus', 'kingBonus'],
  ['squadGain', 'kingBonus'],
  ['boardRefresh', 'boardRefresh'],
  ['mate', 'mate'],
  ['check', 'check'],
  ['transform', 'transform'],
  ['capture', 'capture'],
  ['scroll', 'scroll'],
]

export function playEvents(events: GameEvent[]): void {
  if (muted || events.length === 0) return

  for (const [kind, sound] of PRIORITY) {
    if (events.some((event) => event.kind === kind)) {
      playSound(sound)
      return
    }
  }
}
