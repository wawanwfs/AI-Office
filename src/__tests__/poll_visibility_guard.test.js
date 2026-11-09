// Guard visibilitas interval poll — pola Dashboard 151 / TaskBoard 203 / SysMeter.
// Census siklus 216: dari 11 setInterval di UI, 7 poller HTTP sudah
// visibility-gated, 3 sisanya polling memori scene (window.__agentData) yang
// murah. Dua yang terakhir tanpa guard (ShConsole overview 10 dtk, Ticker 20
// dtk) kini juga di-gerbang — kelas defek terakhir ditutup.
//
// Test ini STATIS (pola perf_chip_hardening/night_probe_hardening): membaca
// sumber agar setiap interval HTTP baru yang lupa guard langsung MERAH.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'src')

// Interval dianggap "HTTP poller" bila effect memuat pemanggilan api(/fetch(
// dan setInterval — polling memori scene murni (read-only window.__agentData)
// dikecualikan via tidak ada api(/fetch( di file-effect yang sama.
function srcFiles() {
  const out = []
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) walk(p)
      else if (/\.(jsx|js)$/.test(f.name) && !f.name.endsWith('.test.js') && !f.name.endsWith('.test.jsx')) out.push(p)
    }
  }
  walk(SRC)
  return out
}

const POLLERS = srcFiles().filter((p) => {
  const s = readFileSync(p, 'utf8')
  return /setInterval/.test(s) && /(api\(|fetch\(|fetchWithTimeout\()/.test(s)
})

describe('poll_visibility_guard — census interval poll HTTP', () => {
  it('kandidat terdeteksi (census tidak boleh kosong — guard test sendiri hidup)', () => {
    expect(POLLERS.length).toBeGreaterThanOrEqual(5)
  })

  it.each(POLLERS.map((p) => [p.replace(ROOT + '/', ''), p]))(
    '%s: setiap setInterval dilindungi guard visibilitas (atau polling memori scene)',
    (_label, p) => {
      const s = readFileSync(p, 'utf8')
      const lines = s.split('\n')
      const hits = []
      lines.forEach((ln, i) => {
        if (/setInterval\(/.test(ln)) hits.push({ line: i, text: ln })
      })
      expect(hits.length).toBeGreaterThan(0)
      for (const h of hits) {
        // Jendela ±6 baris di sekitar interval harus berisi guard visibilitas
        // ATAU dikecualikan eksplisit (interval scene-memory: tidak ada api/fetch
        // dalam effect yang sama → polling memori, murah, dilarang guard palsu).
        const window_ = lines.slice(Math.max(0, h.line - 6), h.line + 6).join('\n')
        const isSceneMemoryPoll = !/(api\(|fetch\(|fetchWithTimeout\()/.test(window_)
        if (!isSceneMemoryPoll) {
          expect(
            /visibilityState\s*===?\s*'visible'/.test(window_),
            `${_label}:${h.line + 1} setInterval HTTP tanpa guard visibilityState: ${h.text.trim()}`
          ).toBe(true)
        }
      }
    }
  )

  it('ShConsole overview: interval 10 dtk ter-gerbang visibilityState', () => {
    const s = readFileSync(join(SRC, 'components', 'ShConsole.jsx'), 'utf8')
    expect(s).toMatch(/setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) loadOverview\(\) \}, 10000\)/)
    expect(s).not.toMatch(/setInterval\(loadOverview, 10000\)/)
  })

  it('Ticker: interval 20 dtk ter-gerbang visibilityState (3 endpoint batch)', () => {
    const s = readFileSync(join(SRC, 'components', 'Ticker.jsx'), 'utf8')
    // Siklus 337: gerbang kini di hook useVisibilityPoll (satu sumber).
    expect(s).toMatch(/useVisibilityPoll\(load, 20000\)/)
  })
})
