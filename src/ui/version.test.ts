import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import serverPkg from '../../server/package.json'
import subPkg from '../../sub/package.json'
import about from '../../public/about.html?raw'
import readme from '../../README.md?raw'
import { APP_VERSION } from './version'

/*
 * Sürüm her yerde aynı olmalı (kullanıcı kararı, 23 Ekim 2026): package.json tek
 * kaynak; elle yazılı kopyalar (Hakkında sayfası, README) ondan kaymasın.
 */
describe('sürüm', () => {
  it('oyunun sürümü package.json ile aynı ve x.y.z biçiminde', () => {
    expect(APP_VERSION).toBe(pkg.version)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('sunucu ve panel paketleri aynı sürümde', () => {
    expect(serverPkg.version).toBe(pkg.version)
    expect(subPkg.version).toBe(pkg.version)
  })

  it('Hakkında sayfası beş dilde aynı sürümü yazıyor', () => {
    const found = [...about.matchAll(/(?:VERSION|VERSIÓN|SÜRÜM) <b>([^<]+)<\/b>/g)].map((m) => m[1])
    expect(found).toHaveLength(5)
    for (const v of found) expect(v).toBe(pkg.version)
  })

  it('README güncel sürümü gösteriyor', () => {
    expect(readme).toContain(`Version ${pkg.version}`)
  })
})
