import { describe, expect, it } from 'vitest'
import {
  ALL_KEYS,
  LANGS,
  type StringKey,
  hasFullProse,
  isProseKey,
  missingKeys,
  translate,
} from './i18n'

describe('sözlük', () => {
  it('her dilde her anahtar boş olmayan bir metin veriyor', () => {
    for (const { code } of LANGS) {
      for (const key of ALL_KEYS) {
        const text = translate(code, key)
        expect(text, `${code}/${key}`).toBeTruthy()
        // Ham anahtar hiçbir zaman ekrana çıkmamalı
        expect(text, `${code}/${key}`).not.toBe(key)
      }
    }
  })

  it('İngilizce tam: eksik bir EN anahtarı sessizce Türkçe gösterirdi', () => {
    expect(missingKeys('en')).toEqual([])
  })

  it('kabuk metinleri beş dilde de tam, yalnızca uzun metinler İngilizceye düşüyor', () => {
    for (const { code } of LANGS) {
      const missing = missingKeys(code).filter((key) => !isProseKey(key))
      expect(missing, `${code} kabuk eksikleri`).toEqual([])
    }
  })

  it('beş dilin tamamı eksiksiz - hiçbir dil yedeğe düşmüyor', () => {
    for (const { code } of LANGS) {
      expect(missingKeys(code), `${code} eksikleri`).toEqual([])
      expect(hasFullProse(code), code).toBe(true)
    }
  })

  it('değişkenleri yerine koyuyor', () => {
    expect(translate('tr', 'home.streak', { n: 5 })).toBe('SERİ 5 GÜN')
    expect(translate('en', 'home.streak', { n: 5 })).toBe('5 DAY STREAK')
    expect(translate('tr', 'flash.kingBonus', { points: 25, lives: 1 })).toContain('+25')
  })

  it('eksik değişkeni olduğu gibi bırakıyor - yarım cümle üretmiyor', () => {
    expect(translate('tr', 'home.streak', {})).toBe('SERİ {n} GÜN')
  })

  it('bilinmeyen anahtar çökertmiyor, anahtarın kendisine düşüyor', () => {
    // Yedek zinciri: dil → İngilizce → Türkçe → anahtar. Sonuncusu olmadan
    // sözlükte olmayan bir anahtar `undefined.replace` ile çöküyordu.
    const unknown = 'yok.boyle.bir.anahtar' as StringKey
    expect(translate('fr', unknown)).toBe(unknown)
  })
})
