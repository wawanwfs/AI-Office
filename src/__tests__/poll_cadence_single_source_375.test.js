// Siklus 375 — konstanta cadence polling SATU sumber (lib/connection_spec.js).
// Dulu literal tersebar & rawan drift diam:
//   15000 ditulis 3× (ProjectPanel/TeamStats/WfsPanel),
//   60000 disalin lokal 2× (projectboard BOARD_POLL_HEALTHY_MS, lounge TV_POLL_HEALTHY_MS),
//   30000 ditulis 2× (projectboard connIv, lounge connTick).
// Mengubah satu situs tanpa yang lain = cadence panel vs scene tak seragam
// tanpa ada tes yang menangkapnya.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  POLL_PANEL_MS, POLL_SCENE_HEALTHY_MS, CONN_TICK_MS,
  POLL_HEALTHY_MS, STALE_AFTER_MS, nextPollDelay,
} from '../lib/connection_spec.js'

const root = resolve(__dirname, '../..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('siklus 375 — konstanta cadence satu sumber', () => {
  it('salinan literal cadence hilang dari 7 situs (3 panel + 2 scene const + 2 conn tick)', () => {
    expect(read('src/components/ProjectPanel.jsx')).not.toMatch(/,\s*15000\s*,/)
    expect(read('src/components/TeamStats.jsx')).not.toMatch(/,\s*15000\s*,/)
    expect(read('src/components/WfsPanel.jsx')).not.toMatch(/,\s*15000\s*,/)
    expect(read('src/scene/parts/projectboard.js')).not.toMatch(/BOARD_POLL_HEALTHY_MS\s*=\s*60000/)
    expect(read('src/scene/parts/lounge.js')).not.toMatch(/TV_POLL_HEALTHY_MS\s*=\s*60000/)
    expect(read('src/scene/parts/projectboard.js')).not.toMatch(/},\s*30000\)/)
    expect(read('src/scene/parts/lounge.js')).not.toMatch(/},\s*30000\)/)
  })

  it('kelima pemakai mengimpor konstanta satu sumber', () => {
    for (const f of ['src/components/ProjectPanel.jsx', 'src/components/TeamStats.jsx', 'src/components/WfsPanel.jsx']) {
      expect(read(f)).toMatch(/POLL_PANEL_MS/)
    }
    for (const f of ['src/scene/parts/projectboard.js', 'src/scene/parts/lounge.js']) {
      const s = read(f)
      expect(s).toMatch(/POLL_SCENE_HEALTHY_MS/)
      expect(s).toMatch(/CONN_TICK_MS/)
    }
  })

  it('nilai kanonik tak berubah (perilaku runtime identik): 15s panel, 60s scene, 30s tick', () => {
    expect(POLL_PANEL_MS).toBe(15000)
    expect(POLL_SCENE_HEALTHY_MS).toBe(60000)
    expect(CONN_TICK_MS).toBe(30000)
    // invarian lama yang masih wajib: panel < scene, tick < scene, stale > panel
    expect(POLL_PANEL_MS).toBeLessThan(POLL_SCENE_HEALTHY_MS)
    expect(CONN_TICK_MS).toBeLessThan(POLL_SCENE_HEALTHY_MS)
    expect(STALE_AFTER_MS).toBeGreaterThan(POLL_HEALTHY_MS)
  })

  it('anti-poisoning nextPollDelay tetap utuh dgn cadence satu sumber', () => {
    expect(nextPollDelay(null, POLL_SCENE_HEALTHY_MS)).toBe(60000)
    const live = { state: 'live', nextDelayMs: null }
    expect(nextPollDelay(live, POLL_SCENE_HEALTHY_MS)).toBe(60000)
    const failing = { state: 'stale', nextDelayMs: 5000 }
    expect(nextPollDelay(failing, POLL_SCENE_HEALTHY_MS)).toBe(5000) // backoff menang
    expect(nextPollDelay(null)).toBe(POLL_HEALTHY_MS) // default panel 15s
  })
})
