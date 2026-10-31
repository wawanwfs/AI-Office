// Siklus 192: kontrak statis alur pembaruan PWA end-to-end. Sumber kebenaran =
// teks file (unit live butuh SW runtime nyata — tidak mungkin di jsdom penuh).
// Menjaga: vite.config (prompt + tanpa injeksi), registrasi satu-sumber di
// App, banner dengan aksi muat-ulang, sw.js TANPA skipWaiting bake-in,
// deploy.py prune root (workbox sibling tidak boleh ikut terpangkas).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf-8')
const viteCfg = read('vite.config.js')
const app = read('src/App.jsx')
const swUpdate = read('src/lib/sw_update.js')
const deployPy = read('scripts/deploy.py')

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

  it('lib: dua jebakan klasik tertutup (waiting-saat-mount + wasControlled)', () => {
    expect(swUpdate).toContain('r.waiting && r.active')
    expect(swUpdate).toContain('wasControlled')
  })
})

describe('deploy.py — prune root aman (siklus 192)', () => {
  it('prune_root_stale dipanggil di deploy() (root ~/wfs-hq ikut bersih)', () => {
    expect(deployPy).toContain('def prune_root_stale()')
    expect(deployPy).toMatch(/deploy\(\)[\s\S]{0,200}prune_root_stale\(\)/)
  })

  it('referensi ROOT dihormati — workbox sibling sw.js TIDAK boleh terpangkas', () => {
    expect(deployPy).toContain('def referenced_root_files()')
    // net luas: basename .js/.css di mana pun dalam 3 file sumber (regex Python)
    expect(deployPy).toContain("[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:js|css)")
  })
})
