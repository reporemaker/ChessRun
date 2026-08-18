import { describe, expect, it } from 'vitest'
import { hasBannedWord, normalizeName } from '../../shared/names'
import { acceptedWeeks, cleanName, cleanSubmit, isoWeekUtc, previousWeek, shortOf, weekStartUtc } from './lb'

// 2026-08-18 Salı 02:00 UTC → ISO hafta 34
const NOW = Date.UTC(2026, 7, 18, 2, 0, 0)

describe('isoWeekUtc', () => {
  it('ISO haftayı UTC ile hesaplıyor', () => {
    expect(isoWeekUtc(NOW)).toBe('2026-W34')
    // Pazartesi 00:00 UTC yeni hafta, bir saniye öncesi eski hafta
    expect(isoWeekUtc(Date.UTC(2026, 7, 17, 0, 0, 0))).toBe('2026-W34')
    expect(isoWeekUtc(Date.UTC(2026, 7, 16, 23, 59, 59))).toBe('2026-W33')
  })

  it('yıl sınırında ISO kuralına uyuyor', () => {
    expect(isoWeekUtc(Date.UTC(2027, 0, 1))).toBe('2026-W53')
    expect(isoWeekUtc(Date.UTC(2026, 0, 1))).toBe('2026-W01')
  })
})

describe('acceptedWeeks / previousWeek', () => {
  it('hafta ortasında yalnızca bu haftayı kabul ediyor', () => {
    expect(acceptedWeeks(NOW)).toEqual(['2026-W34'])
  })

  it('Pazartesi ve Pazar günleri komşu haftaya da izin veriyor', () => {
    expect(acceptedWeeks(Date.UTC(2026, 7, 17, 1))).toEqual(['2026-W33', '2026-W34'])
    expect(acceptedWeeks(Date.UTC(2026, 7, 23, 23))).toEqual(['2026-W34', '2026-W35'])
  })

  it('geçen hafta — yıl sınırı dahil', () => {
    expect(previousWeek('2026-W34')).toBe('2026-W33')
    expect(previousWeek('2026-W35')).toBe('2026-W34')
    expect(previousWeek('2027-W01')).toBe('2026-W53')
    expect(new Date(weekStartUtc('2026-W34')).toISOString()).toBe('2026-08-17T00:00:00.000Z')
  })
})

describe('shortOf', () => {
  it('uuid tireleri atıp 4…2 veriyor', () => {
    expect(shortOf('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2…90')
  })
})

describe('cleanName (sunucu)', () => {
  it('# ve kontrol karakterlerini atıyor, kırpıyor', () => {
    expect(cleanName('  Gölge  #Vezir​ 417 ')).toBe('Gölge Vezir 417')
  })
  it('rezerve ve yasaklı adları reddediyor', () => {
    expect(cleanName('ChessRun Resmi')).toBeNull()
    expect(cleanName('SmartKraft')).toBeNull()
    expect(cleanName('Fuck 123')).toBeNull()
    expect(cleanName('F.u.c.k')).toBeNull()
    expect(cleanName('temiz ad', ['temiz'])).toBeNull()
  })
  it('boş ve metin olmayanı reddediyor', () => {
    expect(cleanName('')).toBeNull()
    expect(cleanName(42)).toBeNull()
  })
  it('24 karakterle sınırlıyor', () => {
    expect(cleanName('a'.repeat(40))).toHaveLength(24)
  })
})

describe('shared/names', () => {
  it('normalize: aksan, l33t, tekrar', () => {
    expect(normalizeName('Şükrü-Ağa')).toEqual(['sukru', 'aga'])
    expect(normalizeName('sh1t')).toEqual(['shit'])
    expect(normalizeName('fuuuuck')).toEqual(['fuck'])
    expect(normalizeName('P@$$w0rd')).toEqual(['password'])
  })

  it('kısa kökler kelime başında, uzun kökler her yerde', () => {
    expect(hasBannedWord('computadora')).toBe(false)
    expect(hasBannedWord('puta madre')).toBe(true)
    expect(hasBannedWord('xxhurensohnxx')).toBe(true)
    expect(hasBannedWord('Ocean Rook')).toBe(false)
    expect(hasBannedWord('Nazif 123')).toBe(false)
  })

  it('panelden gelen ek liste birleşiyor', () => {
    expect(hasBannedWord('Yavuz 12')).toBe(false)
    expect(hasBannedWord('Yavuz 12', ['yavuz'])).toBe(true)
  })
})

const GOOD = {
  token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Gölge Vezir 417',
  alg: 'HMAC-SHA256',
  mode: 'classic',
  score: 1234,
  distance: 56,
  cols: 8,
  level: 3,
  at: '2026-08-18T01:59:00.000Z',
  week: '2026-W34',
  badge: 'queen',
  badgeTier: 'gold',
}

describe('cleanSubmit', () => {
  it('geçerli gövdeyi olduğu gibi alıyor', () => {
    const c = cleanSubmit(GOOD, NOW)
    expect(c).toMatchObject({
      token: GOOD.token,
      name: 'Gölge Vezir 417',
      mode: 'classic',
      score: 1234,
      distance: 56,
      cols: 8,
      level: 3,
      week: '2026-W34',
      daily: null,
      badge: 'queen',
      badgeTier: 'gold',
    })
  })

  it('jeton, mod, hafta bozuksa null', () => {
    expect(cleanSubmit({ ...GOOD, token: 'kısa' }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, token: 'a'.repeat(20) + '<script>' }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, mode: 'god' }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, week: '2026-W20' }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, week: 'bugün' }, NOW)).toBeNull()
    expect(cleanSubmit(null, NOW)).toBeNull()
  })

  it('sayıları kelepçeliyor, sıfır koşuyu atıyor', () => {
    expect(cleanSubmit({ ...GOOD, score: 5_000_000 }, NOW)?.score).toBe(1_000_000)
    expect(cleanSubmit({ ...GOOD, cols: 99 }, NOW)?.cols).toBe(8)
    expect(cleanSubmit({ ...GOOD, cols: 1 }, NOW)?.cols).toBe(4)
    expect(cleanSubmit({ ...GOOD, score: -5 }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, score: 0, distance: 0 }, NOW)).toBeNull()
  })

  it('geçersiz ad koşuyu düşürmüyor, yalnızca adı null yapıyor', () => {
    expect(cleanSubmit({ ...GOOD, name: 'Fuck' }, NOW)?.name).toBeNull()
    expect(cleanSubmit({ ...GOOD, name: '' }, NOW)?.name).toBeNull()
  })

  it('günlük anahtar yalnızca bugün/dün/yarın', () => {
    expect(cleanSubmit({ ...GOOD, daily: '2026-08-18' }, NOW)?.daily).toBe('2026-08-18')
    expect(cleanSubmit({ ...GOOD, daily: '2026-08-01' }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, daily: 'x' }, NOW)).toBeNull()
  })

  it('rozet beyaz-liste dışındaysa düşüyor, koşu kalıyor', () => {
    const c = cleanSubmit({ ...GOOD, badge: '<b>', badgeTier: 'platinum' }, NOW)
    expect(c?.badge).toBeNull()
    expect(c?.badgeTier).toBeNull()
  })
})
