import { describe, expect, it } from 'vitest'
import { hasBannedWord, normalizeName } from '../../shared/names'
import { ALL_LEAGUE_FROM, awardBoards, isBoard, plausibleScoreMax } from '../../shared/leaderboard'
import { acceptedWeeks, cleanName, cleanSubmit, isoWeekUtc, playedAtOf, previousWeek, shortOf, weekStartUtc } from './lb'

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

  it('geçen hafta - yıl sınırı dahil', () => {
    expect(previousWeek('2026-W34')).toBe('2026-W33')
    expect(previousWeek('2026-W35')).toBe('2026-W34')
    expect(previousWeek('2027-W01')).toBe('2026-W53')
    expect(new Date(weekStartUtc('2026-W34')).toISOString()).toBe('2026-08-17T00:00:00.000Z')
  })
})

describe('shortOf', () => {
  it('uuid tireleri atıp 4…2 veriyor', () => {
    expect(shortOf('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3…90')
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
  it('ham adı da taşıyor - reddedilirse panele not düşmek için', () => {
    expect(cleanSubmit({ ...GOOD, name: '  #SmartKraft  ' }, NOW)).toMatchObject({ name: null, rawName: '  #SmartKraft  ' })
    expect(cleanSubmit({ ...GOOD, name: 'x'.repeat(80) }, NOW)?.rawName).toHaveLength(40)
  })

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

  it('makullük: satır başına motorun veremeyeceği puan atılır (mod bazlı tavan)', () => {
    // GOOD: 1234 puan / 56 satır ≈ 22/satır - Av tavanı 80/satır → kabul
    expect(cleanSubmit(GOOD, NOW)).not.toBeNull()
    expect(cleanSubmit({ ...GOOD, score: 80 * 57 }, NOW)).not.toBeNull()
    expect(cleanSubmit({ ...GOOD, score: 80 * 57 + 1 }, NOW)).toBeNull()
    expect(cleanSubmit({ ...GOOD, score: 999_999, distance: 3 }, NOW)).toBeNull()
    // Günlükte bir kayma aralığında çok yeme olabilir - tavan çok daha gevşek
    expect(cleanSubmit({ ...GOOD, mode: 'daily', daily: '2026-08-18', score: 500 * 7, distance: 6 }, NOW)).not.toBeNull()
    expect(cleanSubmit({ ...GOOD, mode: 'daily', daily: '2026-08-18', score: 1000 * 7 + 1, distance: 6 }, NOW)).toBeNull()
    expect(plausibleScoreMax('trio', 0)).toBe(100)
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
    // Kelepçe makullük tavanının altında kalmalı: uzun koşu (100k satır) ile
    expect(cleanSubmit({ ...GOOD, score: 5_000_000, distance: 100_000 }, NOW)?.score).toBe(1_000_000)
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

describe('günün mücadelesi - tohum ve gün', () => {
  it('tohum sırra ve güne bağlı, deterministik, 32 bit', async () => {
    const { dailySeed, acceptedDay } = await import('./lb')
    const a = await dailySeed('s1', '2026-08-18')
    const b = await dailySeed('s1', '2026-08-18')
    const c = await dailySeed('s1', '2026-08-19')
    const d = await dailySeed('s2', '2026-08-18')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toBe(d)
    expect(Number.isInteger(a) && a >= 0 && a <= 0xffffffff).toBe(true)
    // sırsız yedek de deterministik
    expect(await dailySeed(undefined, '2026-08-18')).toBe(await dailySeed(undefined, '2026-08-18'))
    // 12:00 UTC: batıda (UTC-12) hâlâ 18'i 00:00, doğuda (UTC+14) 19'u 02:00 → 18 ve 19 kabul, 17 ve 20 ret
    const noon = Date.parse('2026-08-18T12:00:00Z')
    expect(acceptedDay('2026-08-18', noon)).toBe(true)
    expect(acceptedDay('2026-08-19', noon)).toBe(true)
    expect(acceptedDay('2026-08-17', noon)).toBe(false)
    expect(acceptedDay('2026-08-20', noon)).toBe(false)
    // 06:00 UTC: batıda hâlâ 17'si (18:00), doğuda 18'i 20:00 → 17 ve 18 kabul, 19 ret
    const morning = Date.parse('2026-08-18T06:00:00Z')
    expect(acceptedDay('2026-08-17', morning)).toBe(true)
    expect(acceptedDay('2026-08-18', morning)).toBe(true)
    expect(acceptedDay('2026-08-19', morning)).toBe(false)
    expect(acceptedDay('bozuk', noon)).toBe(false)
  })
})

describe('günlük çarpan', () => {
  it('formül: 1 + puan/1000, üst sınır yok, aşağı yuvarlama, skor tavanı', async () => {
    const { dailyBonus, applyDailyBonus, LB_LIMITS } = await import('../../shared/leaderboard')
    expect(dailyBonus(null)).toBe(1)
    expect(dailyBonus(0)).toBe(1)
    expect(dailyBonus(150)).toBeCloseTo(1.15)
    expect(dailyBonus(500)).toBe(1.5)
    expect(dailyBonus(1000)).toBe(2)
    expect(dailyBonus(1882)).toBeCloseTo(2.882)
    expect(applyDailyBonus(1000, 150)).toBe(1150)
    expect(applyDailyBonus(333, 150)).toBe(382)
    expect(applyDailyBonus(1000, 1000)).toBe(2000)
    expect(applyDailyBonus(LB_LIMITS.scoreMax, 5000)).toBe(LB_LIMITS.scoreMax)
  })

  it('cleanSubmit koşunun gününü (day) taşır, bozuksa düşürür', () => {
    const now = Date.parse('2026-08-18T12:00:00Z')
    const base = { token: 'abcdefghijklmnop1234', name: 'x', alg: 'HMAC-SHA256', mode: 'classic', score: 10, distance: 3, cols: 8, level: 1, at: new Date(now).toISOString(), week: '2026-W34' }
    expect(cleanSubmit({ ...base, day: '2026-08-18' }, now)?.day).toBe('2026-08-18')
    expect(cleanSubmit({ ...base, day: '2020-01-01' }, now)?.day).toBeNull()
    expect(cleanSubmit(base, now)?.day).toBeNull()
  })
})

describe('paylaşım sayfası (/s/)', () => {
  it('dilinde başlık/açıklama, kaçırılmış, oyuna yönlendirir', async () => {
    const { buildSharePage, renderSharePage } = await import('./share')
    const url = new URL('https://chessrun.app/s/?g=daily&d=2026-08-18&p=318&r=41&c=34&n=Ate%C5%9F%20At&l=tr&k=3')
    const page = buildSharePage(url)
    expect(page.title).toContain('Günün Mücadelesi')
    expect(page.description).toContain('Ateş At 318 puan yaptı')
    expect(page.description).toContain('3 gün üst üste')
    expect(page.target).toBe('https://chessrun.app/?g=daily&d=2026-08-18')
    const html = renderSharePage(page, url.toString())
    expect(html).toContain('og:image')
    expect(html).toContain('lang="tr"')
    const bad = buildSharePage(new URL('https://chessrun.app/s/?g=classic&p=1&n=%3Cscript%3Ex%3C/script%3E&l=en'))
    expect(renderSharePage(bad, 'x')).not.toContain('<script>x')
    const en = buildSharePage(new URL('https://chessrun.app/s/?g=zzz&l=xx&p=5'))
    expect(en.title).toBe('ChessRun · Hunt')
    expect(en.target).toBe('https://chessrun.app/?g=classic')
  })
})

describe('playedAtOf - günlük çarpanın zaman eşiği', () => {
  const now = Date.parse('2026-08-19T12:00:00Z')
  it('koşunun kendi zamanı: geç gelen (kuyruk) koşu oynandığı ana göre değerlendirilir', () => {
    expect(playedAtOf('2026-08-19T08:00:00Z', now)).toBe(Date.parse('2026-08-19T08:00:00Z'))
  })
  it('ileri tarihli koşu sunucu saatine kırpılır; bozuk tarih = şimdi', () => {
    expect(playedAtOf('2026-08-20T00:00:00Z', now)).toBe(now)
    expect(playedAtOf('saçma', now)).toBe(now)
    expect(playedAtOf('', now)).toBe(now)
  })
})

describe('ortak lig', () => {
  it('tablo adı: ortak lig ve oyunlar geçerli, başkası değil', () => {
    expect(isBoard('all')).toBe(true)
    expect(isBoard('classic')).toBe(true)
    expect(isBoard('daily')).toBe(true)
    expect(isBoard('ALL')).toBe(false)
    expect(isBoard(undefined)).toBe(false)
  })

  it('birincilikler geçiş haftasından itibaren ortak ligden, öncesi oyun bazlı', () => {
    expect(ALL_LEAGUE_FROM).toBe('2026-W43')
    expect(awardBoards('2026-W42')).toEqual(['classic', 'kingRun', 'trio', 'daily'])
    expect(awardBoards('2026-W43')).toEqual(['all'])
    expect(awardBoards('2027-W01')).toEqual(['all'])
    expect(awardBoards('2025-W52')).toEqual(['classic', 'kingRun', 'trio', 'daily'])
  })
})
