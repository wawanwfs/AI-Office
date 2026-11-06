// Siklus 192: kontrak statis alur pembaruan PWA end-to-end. Sumber kebenaran =
// teks file (unit live butuh SW runtime nyata — tidak mungkin di jsdom penuh).
// Menjaga: vite.config (prompt + tanpa injeksi), registrasi satu-sumber di
// App, banner dengan aksi muat-ulang, sw.js TANPA skipWaiting bake-in.
// Deployment filesystem behavior is covered by scratch-only Python fixtures.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf-8')
const viteCfg = read('vite.config.js')
const app = read('src/App.jsx')
const swUpdate = read('src/lib/sw_update.js')

describe('vite.config.js — mode prompt + registrasi eksplisit', () => {
  it('registerType prompt (SW baru menunggu, tanpa skipWaiting bake-in)', () => {
    expect(viteCfg).toContain("registerType: 'prompt'")
    expect(viteCfg).not.toContain("registerType: 'autoUpdate'")
  })

  it('injectRegister null — tidak ada registerSW.js injeksi naif (double-registrasi)', () => {
    expect(viteCfg).toContain('injectRegister: null')
  })
})

describe('App.jsx — wiring banner pembaruan', () => {
  it('registrasi SATU SUMBER via lib/sw_update (bukan inline navigator.serviceWorker)', () => {
    expect(app).toContain("from './lib/sw_update'")
    expect(app).not.toMatch(/navigator\.serviceWorker/)
    expect(app).toContain('setupServiceWorkerUpdates')
  })

  it('banner: state waiting → alert dgn tombol Muat ulang → applyUpdate', () => {
    expect(app).toMatch(/swUpdateReady && \(/)
    expect(app).toContain('Versi baru kantor tersedia')
    expect(app).toContain('Muat ulang')
    expect(app).toContain('applySwUpdate()')
  })

  it('lib: dua jebakan klasik tertutup (poll waiting eksplisit + wasControlled)', () => {
    // waiting dicek EKSPLISIT (bukan bergantung event updatefound — bukti diag
    // 192: event menyala sebelum listener terpasang; poll yang menyelamatkan)
    expect(swUpdate).toContain('reg.waiting &&')
    expect(swUpdate).toContain('setInterval')
    expect(swUpdate).toContain('wasControlled')
  })
})

// Publication safety (including retained root Workbox siblings) is exercised
// once by deploy_prune.test.js through scripts/test_deploy_safe.py. Current
// Workbox references are checked with filesystem fixtures in hygiene_gate.test.js;
// neither contract requires automatic pruning during routine deployment.
