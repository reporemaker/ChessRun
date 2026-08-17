import { defineConfig } from 'vitest/config'

// Worker testleri oyunun koşusuna karışmasın: kök vitest.config.ts
// include'ı src/** + shared/** ile sınırlıyor, bu dosya da server/'ı
// kendi içinde tutuyor.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
