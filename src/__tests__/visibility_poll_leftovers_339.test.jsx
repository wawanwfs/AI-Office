// Siklus 339 — migrasi dua sisa salinan setInterval+gate visibilityState+
// listener visibilitychange ke hook useVisibilityPoll (satu sumber siklus 337):
// - SysMeter: 2 poll (API status 12 dtk + hitungan avatar scene 4 dtk).
// - ShConsole: poll overview 10 dtk (dulu digabung dgn setup EventSource).
// Pasca migrasi: NOL salinan setInterval/visibilitychange tersisa di komponen —
// semua di dalam hook (lib/dialogA11y.js).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8')

describe('migrasi sisa polling visibility ke hook (siklus 339)', () => {
  it('SysMeter memakai useVisibilityPoll 2x (API 12 dtk, scene 4 dtk), salinan inline hilang', () => {
    const s = read('src/components/SysMeter.jsx')
    expect(s.match(/useVisibilityPoll\(/g)?.length).toBe(2)
    expect(s).toMatch(/useVisibilityPoll\(load, 12000\)/)
    expect(s).toMatch(/useVisibilityPoll\(\(\) => setSceneAgents\(/)
    expect(s).toMatch(/4000\)/)
    expect(s).not.toContain("setInterval(() => { if (document.visibilityState === 'visible') load() }, 12000)")
    expect(s).not.toContain("setInterval(() => { if (document.visibilityState === 'visible') readScene() }, 4000)")
    expect(s).not.toContain("document.addEventListener('visibilitychange'")
    expect(s).not.toContain("document.removeEventListener('visibilitychange'")
    // guard rid out-of-order tetap di komponen (pola siklus 131)
    expect(s).toMatch(/my !== s\.rid/)
  })

  it('ShConsole overview memakai useVisibilityPoll(loadOverview, 10000), salinan inline hilang', () => {
    const s = read('src/components/ShConsole.jsx')
    expect(s).toMatch(/useVisibilityPoll\(loadOverview, 10000, \{ enabled: show && tab === 'overview' \}\)/)
    expect(s).not.toContain("setInterval(() => { if (document.visibilityState === 'visible') loadOverview() }, 10000)")
    expect(s).not.toContain("document.addEventListener('visibilitychange'")
    // setup EventSource overview tetap utuh (tidak diregresikan)
    expect(s).toMatch(/new EventSource\('\/wfs-api\/events'\)/)
    expect(s).toMatch(/esAlive = false/)
  })

  it('hook useVisibilityPoll tetap satu sumber: setInterval+visibilitychange hanya ada di lib', () => {
    const lib = read('src/lib/dialogA11y.js')
    expect(lib).toMatch(/setInterval\(tick, intervalMs\)/)
    expect(lib).toMatch(/document\.addEventListener\('visibilitychange', tick\)/)
    const sysmeter = read('src/components/SysMeter.jsx')
    const shconsole = read('src/components/ShConsole.jsx')
    expect(sysmeter).not.toMatch(/setInterval\(/)
    expect(shconsole).not.toMatch(/setInterval\(/)
  })
})
