// Siklus 377: nama zona lantai 'L{n} · {zona}' SATU sumber — floorZonePrefix
// (scene/parts/agent_status.js). Dulu tersalin 3×: floorZoneName (zona saja,
// sah), ternary fallback AgentInspector, FLOORS[].name FloorNavigator.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

import { floorZoneName, floorZonePrefix, FLOOR_ZONE_PREFIX } from '../scene/parts/agent_status.js'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

describe('siklus 377 — zona lantai satu sumber', () => {
  it('salinan manual hilang dari 2 situs UI', () => {
    const inspector = read('src/components/AgentInspector.jsx')
    expect(inspector).not.toMatch(/floor === 1 \? 'Ops & AI'/)
    expect(inspector).toMatch(/floorZonePrefix\(agent\.floor\)/)
    const nav = read('src/components/FloorNavigator.jsx')
    expect(nav).not.toMatch(/name: 'L1 · Ops & AI'/)
    expect(nav).not.toMatch(/name: 'L2 · Engineering'/)
    expect(nav).not.toMatch(/name: 'L3 · Executive'/)
    expect(nav).toMatch(/FLOOR_ZONE_PREFIX\(/)
  })

  it('nilai kanonik & paritas floorZonePrefix === FLOOR_ZONE_PREFIX', () => {
    expect(floorZonePrefix(1)).toBe('L1 · Ops & AI')
    expect(floorZonePrefix(2)).toBe('L2 · Engineering')
    expect(floorZonePrefix(3)).toBe('L3 · Executive')
    expect(FLOOR_ZONE_PREFIX).toBe(floorZonePrefix)
  })

  it('anti-poisoning: lantai tak dikenal → null (zona tak dikarang)', () => {
    for (const bad of [0, 4, undefined, null, NaN, '1', 1.5]) {
      expect(floorZonePrefix(bad)).toBeNull()
    }
    expect(floorZoneName(0)).toBeNull()
  })

  it('konsistensi lintas situs: prefix = "L" + n + zona floorZoneName', () => {
    for (const n of [1, 2, 3]) {
      expect(floorZonePrefix(n)).toBe(`L${n} · ${floorZoneName(n)}`)
    }
  })
})
