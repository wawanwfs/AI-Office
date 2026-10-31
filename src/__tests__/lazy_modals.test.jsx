// @vitest-environment jsdom
// Siklus 190: ShConsole (38K) & SettingsModal (22K) lazy + mount-on-demand —
// lanjutan pola TaskBoard (189). Modal keduanya POLLED (show via prop dari
// App-state, bukan CustomEvent) → TIDAK butuh gerbang buffer ala
// taskboard_gate: membuka = flag wanted naik BERSAMA show (satu batch React)
// → lazy() render SUDAH dalam keadaan terbuka; event buka tidak mungkin
// hilang. Kontrak ShConsole "tidak pernah unmount" tetap utuh: pasca open
// pertama komponen terus ter-render (show=false → null), open kedua sinkron.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { Suspense, lazy } from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(import.meta.url)
const dir = resolve(here, '..')
const appSrc = readFileSync(resolve(dir, '../App.jsx'), 'utf-8')
const viteSrc = readFileSync(resolve(dir, '../../vite.config.js'), 'utf-8')

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('lazy modals — wiring statis (siklus 190)', () => {
  it('App lazy(): ShConsole & SettingsModal tidak lagi import statis', () => {
    expect(appSrc).toContain("const ShConsole = lazy(() => import('./components/ShConsole'))")
    expect(appSrc).toContain("const SettingsModal = lazy(() => import('./components/SettingsModal'))")
    expect(appSrc).not.toMatch(/import ShConsole from '\.\/components\/ShConsole'/)
    expect(appSrc).not.toMatch(/import SettingsModal from '\.\/components\/SettingsModal'/)
  })

  it('mount-on-demand: render dikondisikan (wanted || show) dalam Suspense', () => {
    expect(appSrc).toContain('(scWanted || showConsoleS) &&')
    expect(appSrc).toContain('(smWanted || showSettingsS)')
    expect(appSrc).toContain('<Suspense fallback={null}><ShConsole')
  })

  it('setter gabungan: open menaikkan wanted; close TIDAK menurunkan wanted (kontrak tanpa unmount)', () => {
    expect(appSrc).toContain('const setShowConsole = useCallback((v) => {')
    expect(appSrc).toContain('if (v) setScWanted(true)')
    expect(appSrc).toContain('const setShowSettings = useCallback((v) => {')
    expect(appSrc).toContain('if (v) setSmWanted(true)')
    // close memanggil setter dgn false — wanted TIDAK diturunkan (tetap mounted)
    expect(appSrc).toContain('onClose={() => setShowConsole(false)}')
    expect(appSrc).toContain('onClose={() => setShowSettings(false)}')
  })

  it('vite modulePreload tidak mem-preload chunk lazy baru (satu regex dgn TaskBoard 189)', () => {
    expect(viteSrc).toContain('/TaskBoard|ShConsole|SettingsModal/')
    // Vite 8/rolldown wajib return array (pelajaran 189: `map is not a function`)
    expect(viteSrc).toContain('(deps || []).filter')
  })
})

describe('lazy ShConsole — perilaku live jsdom (siklus 190)', () => {
  it('open pertama async (chunk); close → dialog hilang, wanted tetap; open kedua SINKRON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    class FakeES {
      constructor() { this.close = vi.fn() }
      addEventListener() {}
    }
    vi.stubGlobal('EventSource', FakeES)
    const LazyShConsole = lazy(() => import('../components/ShConsole'))
    // Simulasi persis pola App: wanted||show menggantungkan render; setter
    // gabungan menaikkan wanted BERSAMA show; close hanya menurunkan show.
    let wanted = false
    let show = false
    const tree = () => (
      <Suspense fallback={null}>
        {(wanted || show) && <LazyShConsole show={show} onClose={() => { show = false }} />}
      </Suspense>
    )
    const { rerender } = render(tree())
    expect(screen.queryByRole('dialog')).toBeNull() // belum wanted → tak ter-render

    wanted = true; show = true // jalur setShowConsole(true) — satu batch
    rerender(tree())
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy()) // chunk async

    show = false // close — wanted TIDAK turun
    rerender(tree())
    expect(screen.queryByRole('dialog')).toBeNull()

    show = true // open kedua — komponen sudah termuat → SINKRON
    rerender(tree())
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
