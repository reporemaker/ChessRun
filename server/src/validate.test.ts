import { describe, expect, it } from 'vitest'
import {
  MAX_DURATION_MS,
  acceptLang,
  clampInt,
  cleanRun,
  cleanSession,
  cleanVisit,
  countryCode,
  isBot,
  looksAutomated,
  langCode,
  parseAgent,
  referrerHost,
} from './validate'

const HOST = 'chessrun.example'

describe('clampInt', () => {
  it('aralığa kelepçeliyor ve yuvarlıyor', () => {
    expect(clampInt(5.6, 0, 10)).toBe(6)
    expect(clampInt(-3, 0, 10)).toBe(0)
    expect(clampInt(99, 0, 10)).toBe(10)
  })

  it('sayı olmayanı yedeğe düşürüyor', () => {
    expect(clampInt('abc', 0, 10, 7)).toBe(7)
    expect(clampInt(NaN, 0, 10, 7)).toBe(7)
    expect(clampInt(Infinity, 0, 10, 7)).toBe(7)
    expect(clampInt(null, 0, 10, 7)).toBe(7)
  })
})

describe('langCode', () => {
  it('iki harfe indiriyor', () => {
    expect(langCode('tr-TR')).toBe('tr')
    expect(langCode('EN')).toBe('en')
  })

  it('harf olmayanı reddediyor — çöp değer kırılımı zehirler', () => {
    expect(langCode('9!')).toBe('')
    expect(langCode('')).toBe('')
    expect(langCode(42)).toBe('')
    expect(langCode('<script>')).toBe('')
  })
})

describe('acceptLang', () => {
  it('ilk etiketi alıyor', () => {
    expect(acceptLang('tr-TR,tr;q=0.9,en;q=0.8')).toBe('tr')
    expect(acceptLang('de')).toBe('de')
  })

  it('başlık yoksa boş', () => {
    expect(acceptLang(null)).toBe('')
    expect(acceptLang('')).toBe('')
  })
})

describe('referrerHost', () => {
  /**
   * Yolun atılması güvenlik gereği: arama sayfaları terimi, bazı siteler
   * jetonu yola gömüyor. Panelde hiçbir işe yaramazken saklamak riski
   * bedavaya almak olurdu.
   */
  it('yalnızca host bırakıyor, yolu ve sorguyu atıyor', () => {
    expect(referrerHost('https://google.com/search?q=gizli+arama', HOST)).toBe('google.com')
    expect(referrerHost('https://t.co/abc123', HOST)).toBe('t.co')
  })

  it('kendi sitesinden gelen gezinmeyi yönlendiren saymıyor', () => {
    expect(referrerHost(`https://${HOST}/oyun`, HOST)).toBe('')
  })

  it('bozuk girdide çökmüyor', () => {
    expect(referrerHost('kirik', HOST)).toBe('')
    expect(referrerHost(undefined, HOST)).toBe('')
    expect(referrerHost(123, HOST)).toBe('')
  })
})

describe('countryCode', () => {
  it('iki büyük harf, bilinmiyorsa XX', () => {
    expect(countryCode('tr')).toBe('TR')
    expect(countryCode(null)).toBe('XX')
    expect(countryCode('T1')).toBe('XX')
    expect(countryCode('TURKIYE')).toBe('XX')
  })
})

describe('cleanRun', () => {
  const valid = {
    sessionId: 'sess-1',
    appVersion: '1.0',
    uiLang: 'tr',
    mode: 'trio',
    daily: true,
    score: 500,
    distance: 20,
    cols: 6,
    level: 3,
    durationMs: 60_000,
    endReason: 'stuckOut',
    speed: 'fast',
    kings: 1,
    bestStreak: 3,
    stuckUsed: 2,
    mated: false,
  }

  it('geçerli gövdeyi olduğu gibi geçiriyor', () => {
    expect(cleanRun(valid)).toMatchObject({ mode: 'trio', score: 500, endReason: 'stuckOut' })
  })

  it('oturum kimliği yoksa reddediyor', () => {
    expect(cleanRun({ ...valid, sessionId: '' })).toBeNull()
    expect(cleanRun(null)).toBeNull()
    expect(cleanRun('metin')).toBeNull()
  })

  /**
   * Doğrulamanın asıl işi bu: sınırsız serbest metin kabul eden tek bir
   * alan, birinin kırılımı on bin çöp değerle zehirlemesine yeter.
   */
  it('liste dışı değerleri güvenli varsayılana çekiyor, kabul etmiyor', () => {
    const dirty = cleanRun({
      ...valid,
      mode: 'uydurma-mod',
      uiLang: 'zz',
      endReason: '<script>alert(1)</script>',
      speed: 'isik-hizi',
    })
    expect(dirty?.mode).toBe('classic')
    expect(dirty?.uiLang).toBe('tr')
    expect(dirty?.endReason).toBe('other')
    expect(dirty?.speed).toBe('normal')
  })

  it('süreyi iki saate kırpıyor — arka plandaki sekme saati şişiriyor', () => {
    expect(cleanRun({ ...valid, durationMs: 9 * 60 * 60 * 1000 })?.durationMs).toBe(MAX_DURATION_MS)
    expect(cleanRun({ ...valid, durationMs: -5 })?.durationMs).toBe(0)
  })

  it('uçuk skorları kelepçeliyor', () => {
    expect(cleanRun({ ...valid, score: 9e15 })?.score).toBe(1_000_000)
    expect(cleanRun({ ...valid, distance: -40 })?.distance).toBe(0)
  })

  it('bilinmeyen anahtarları düşürüyor', () => {
    const extra = cleanRun({ ...valid, token: 'gizli-cihaz-jetonu', evil: true })
    expect(extra).not.toBeNull()
    expect(Object.keys(extra as object)).not.toContain('token')
    expect(Object.keys(extra as object)).not.toContain('evil')
  })
})

describe('cleanVisit', () => {
  it('bayrakları katı boolean olarak alıyor', () => {
    const clean = cleanVisit(
      { sessionId: 's', touch: 'evet', standalone: 1, reducedMotion: true },
      HOST,
    )
    expect(clean?.touch).toBe(false)
    expect(clean?.standalone).toBe(false)
    expect(clean?.reducedMotion).toBe(true)
  })

  it('görünüm kovası liste dışıysa varsayılana düşüyor', () => {
    expect(cleanVisit({ sessionId: 's', viewport: 'devasa' }, HOST)?.viewport).toBe('md')
  })
})

describe('cleanSession', () => {
  it('oturum süresini bir güne kırpıyor — koşudan farklı tavan', () => {
    const clean = cleanSession({ sessionId: 's', durationMs: 5 * 24 * 3600 * 1000, runs: 3 })
    expect(clean?.durationMs).toBe(24 * 3600 * 1000)
    expect(clean?.runs).toBe(3)
  })
})

describe('parseAgent', () => {
  const CHROME_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
  const SAFARI_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const EDGE =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'
  const ANDROID_TABLET =
    'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

  it('Chrome masaüstünü tanıyor', () => {
    expect(parseAgent(CHROME_MAC)).toEqual({ browser: 'chrome', os: 'macos', device: 'desktop' })
  })

  it('iOS Safari mobil', () => {
    expect(parseAgent(SAFARI_IOS)).toEqual({ browser: 'safari', os: 'ios', device: 'mobile' })
  })

  /** Sıra önemli: Edge kendini Chrome, Chrome kendini Safari ilan ediyor */
  it('Edge, Chrome olarak sayılmıyor', () => {
    expect(parseAgent(EDGE).browser).toBe('edge')
  })

  it('Mobile taşımayan Android tablet sayılıyor', () => {
    expect(parseAgent(ANDROID_TABLET).device).toBe('tablet')
  })

  it('boş UA çökertmiyor', () => {
    expect(parseAgent(null)).toEqual({ browser: 'other', os: 'other', device: 'desktop' })
  })
})

describe('isBot', () => {
  it('yaygın tarayıcı olmayanları eliyor', () => {
    expect(isBot('Googlebot/2.1')).toBe(true)
    expect(isBot('curl/8.4.0')).toBe(true)
    expect(isBot('HeadlessChrome/151')).toBe(true)
    expect(isBot('python-requests/2.31')).toBe(true)
  })

  it('gerçek tarayıcıyı elemiyor', () => {
    expect(
      isBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
  })
})

describe('looksAutomated', () => {
  const phone = { device: 'mobile' as const, os: 'android', acceptLang: 'tr' }

  it('Accept-Language boşsa makine sayıyor', () => {
    expect(looksAutomated({ ...phone, acceptLang: '' })).toBe(true)
    expect(looksAutomated({ device: 'desktop', os: 'windows', acceptLang: '' })).toBe(true)
  })

  it('telefon UA + dokunmatik yok = emülasyon', () => {
    expect(looksAutomated({ ...phone, touch: false })).toBe(true)
    expect(looksAutomated({ ...phone, os: 'ios', touch: false })).toBe(true)
  })

  it('gerçek telefonu ve masaüstünü elemiyor', () => {
    expect(looksAutomated({ ...phone, touch: true })).toBe(false)
    expect(looksAutomated({ device: 'desktop', os: 'macos', acceptLang: 'en', touch: false })).toBe(false)
    // touch bilinmiyorsa (koşu/oturum uçları) yalnızca başlık sayılır
    expect(looksAutomated(phone)).toBe(false)
  })
})
