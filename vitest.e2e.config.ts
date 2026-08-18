import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Uçtan uca testler - yerel Worker'a karşı (wrangler dev, 8787). Normal
 * `npm test` bunları almıyor (desen *.e2e.ts); elle:
 *   cd server && npm run dev        (ayrı pencerede)
 *   npm run test:e2e
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.e2e.ts'],
    env: { VITE_LEADERBOARD_URL: 'http://127.0.0.1:8787/lb' },
  },
})
