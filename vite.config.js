import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configureManualChunks } from './src/lib/chunk_strategy.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'wfs-logo.svg', 'fonts/fonts.css', 'og-image.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'WFS Project HQ — Kantor AI 3D',
        short_name: 'WFS HQ',
        description: 'Kantor virtual 3D WFS Project: 15 agent AI bekerja dan mengerjakan task nyata.',
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
    chunkSizeWarningLimit: 800,
    // Siklus 189: TaskBoard lazy (lazy() di App) HARUS benar-benar ditunda —
    // dulu Vite menyuntik <link rel=modulepreload> untuk dynamic import, yang
    // membuat browser mengunduh+eksekusi chunk DI AWAL juga (lazy hanya di
    // grafik modul, bukan di jaringan — bukti diag: initiatorType 'script'
    // pasca reload, node LINK preload). resolveDependencies membuang preload
    // chunk TaskBoard; preload aset statis lain tetap utuh.
    modulePreload: {
      resolveDependencies(filename, deps) {
        return (deps || []).filter((f) => !/TaskBoard/.test(f))
      },
    },
    rollupOptions: {
      output: {
        manualChunks: configureManualChunks,
      },
    },
  },
})
