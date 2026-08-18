import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Bu dosya bugün hiçbir davranışı değiştirmiyor — `include` yazılmadan da
 * aynı 7 dosya çalışıyordu. Var olma sebebi **sınırı görünür kılmak**.
 *
 * `npm test` yapılandırmasız `vitest run` idi, yani kökten aşağı tarıyordu.
 * `sub/` ve `server/` eklendiği an onların testleri de bu koşuya karışırdı;
 * Worker testleri oyunun node ortamında kafa karıştırıcı şekilde patlardı.
 * Her paket kendi test koşusunu kendi taşıyor.
 */
export default defineConfig({
  // vite.config.ts'teki takma adın test karşılığı: `@shared/*` bugüne kadar
  // yalnızca tip taşıyordu, `shared/names` ile ilk kez çalışma zamanına girdi.
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts'],
  },
})
