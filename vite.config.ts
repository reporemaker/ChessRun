import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    /* Üretimde toplama ucu APEX'te, yani oyunla AYNI ORIGIN — CORS diye
       bir şey yok ve `sendBeacon` sorunsuz çalışıyor (beacon preflight
       yapamaz, çapraz origin'de oturum olayları iOS'ta sessizce kaybolur).
       Yerelde vite 5173, Worker 8787'de; proxy olmasa geliştirme ortamı
       üretimden farklı davranır ve CORS'u Worker'a eklemek zorunda
       kalırdık — üretimin hiç ihtiyaç duymadığı bir kod.
       Bu yüzden yerelde de aynı origin: VITE_STATS_URL=/collect */
    proxy: {
      '/collect': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  resolve: {
    // tsconfig.app.json'daki @shared/* takma adının çalışma zamanı karşılığı.
    // shared/ oyun, Worker ve panel arasındaki tek ortak sözleşme.
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
})
