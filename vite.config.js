import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configureManualChunks } from './src/lib/chunk_strategy.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Siklus 192: mode 'prompt' — SW baru TIDAK skipWaiting bake-in; versi
      // baru menunggu sampai pengguna klik "Muat ulang" (banner App). Dulu
      // 'autoUpdate' + registrasi injeksi naif: SW baru mengambil alih tanpa
      // reload sesi lama → tab basi memakai chunk hashed lama (prune deploy.py
      // bisa membuat import() lazy-nya 404) tanpa pemberitahuan apa pun.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'wfs-logo.svg', 'fonts/fonts.css', 'og-image.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'WFS Project HQ — Kantor AI 3D',
        short_name: 'WFS HQ',
        description: 'Kantor virtual 3D WFS Project: 26 agen AI bekerja dan mengerjakan task nyata.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#000C1E',
        theme_color: '#000C1E',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    // Siklus 433: sourcemap produksi. Lighthouse best-practices 432 menandai
    // valid-source-maps (chunk vendor tanpa sourcemap) — hidden sourcemap
    // (.map tanpa // # sourceMappingURL) memulihkan debuggability tanpa
    // mengekspos source asli lewat devtools publik (URL .map tidak disebut).
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 800,
    // Siklus 189-190: TaskBoard, ShConsole & SettingsModal lazy (lazy() di App)
    // HARUS benar-benar ditunda — dulu Vite menyuntik <link rel=modulepreload>
    // untuk dynamic import, yang membuat browser mengunduh+eksekusi chunk DI
    // AWAL juga (lazy hanya di grafik modul, bukan di jaringan — bukti diag:
    // initiatorType 'script' pasca reload, node LINK preload).
    // resolveDependencies membuang preload chunk lazy tersebut; preload aset
    // statis lain tetap utuh.
    modulePreload: {
      resolveDependencies(filename, deps) {
        return (deps || []).filter((f) => !/TaskBoard|ShConsole|SettingsModal/.test(f))
      },
    },
    rollupOptions: {
      output: {
        manualChunks: configureManualChunks,
      },
    },
  },
})
