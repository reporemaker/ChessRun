import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.app.json'daki @shared/* takma adının çalışma zamanı karşılığı.
    // shared/ oyun, Worker ve panel arasındaki tek ortak sözleşme.
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
})
