import { describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, formatCode, generateCode, lookupOf, normalizeCode } from './recovery'

describe('kurtarma kodu', () => {
  it('12 karakter Crockford base32 üretiyor, XXXX-XXXX-XXXX gösteriyor', () => {
    const code = generateCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/)
    expect(formatCode(code)).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(normalizeCode(formatCode(code))).toBe(code)
  })

  it('kullanıcı yazımını hoş görüyor: küçük harf, boşluk, O/I/L/U karışıklığı', () => {
    expect(normalizeCode('7k3m 9qrt 2xwz')).toBe('7K3M9QRT2XWZ')
    expect(normalizeCode('o1il-u000-0000')).toBe('0111V0000000')
    expect(normalizeCode('7K3M-9QRT')).toBeNull() // kısa
    expect(normalizeCode('7K3M-9QRT-2XW*')).toBeNull() // alfabe dışı işaret atılınca kısa kalır
  })

  it('doğru kodla açılıyor, yanlış kodla açılmıyor; lookup koddan türüyor', async () => {
    const code = generateCode()
    const payload = { v: 1 as const, token: '2c9a4d1e-1111-4222-8333-444455556666', secret: 'c2VjcmV0', name: 'Gölge Vezir', createdAt: '2026-08-19T00:00:00.000Z' }
    const blob = await encryptPayload(code, payload)
    expect(await decryptPayload(code, blob)).toEqual(payload)
    const other = generateCode()
    expect(await decryptPayload(other, blob)).toBeNull()
    expect(await decryptPayload(code, 'bozuk')).toBeNull()
    expect(await lookupOf(code)).toMatch(/^[a-f0-9]{64}$/)
    expect(await lookupOf(code)).not.toBe(await lookupOf(other))
    // Blob sunucu sınırının çok altında
    expect(blob.length).toBeLessThan(600)
  })
})
