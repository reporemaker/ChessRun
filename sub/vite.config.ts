import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Yerelde Worker 8787'de; /api aynı origin görünsün diye proxy.
    // Üretimde panel ve API zaten aynı Worker'dan geliyor.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
})
