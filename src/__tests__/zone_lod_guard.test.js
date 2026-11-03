// Guard anti-regresi LOD label zona (siklus 246) — drift-gate sumber.
// Latar: temuan A/B kamera rendah siklus 245 (temuan B3): billboard label zona
// menutupi rak server saat kamera rendah. Fix = parts/zone_lod.js (LOD jarak,
// clamp 0.45) + baseScale di flooring.js + penerapan di animate() OfficeScene
// SEBELUM buildZonePts (box kolisi memakai ukuran yang digambar).
// Pola drift-gate 240/242: baca sumber, asersi anchor eksak — regresi = merah.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { zoneLodFactor, applyZoneLod } from '../scene/parts/zone_lod.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('zone_lod — kontrak murni terkunci', () => {
  it('faktor: full ≥30, linear dist/30, clamp 0.45, NaN → 1', () => {
    expect(zoneLodFactor(30)).toBe(1)
    expect(zoneLodFactor(15)).toBeCloseTo(0.5, 10)
    expect(zoneLodFactor(3)).toBe(0.45)
    expect(zoneLodFactor(NaN)).toBe(1)
  })
  it('applyZoneLod tanpa baseScale → no-op (kompat label versi lama)', () => {
    const s = { scale: { x: 3.4, y: 0.64 }, userData: {} }
    expect(applyZoneLod(s, 9)).toBe(1)
    expect(s.scale.x).toBe(3.4)
  })
})

describe('zone_lod — anchor sumber (anti-regresi)', () => {
  it('flooring.js memasang userData.baseScale dari skala penuh yang sama', () => {
    const src = read('src/scene/parts/flooring.js')
    expect(src).toContain('zl.userData.baseScale={x:3.4*zsc,y:.64*zsc}')
    // urutan benar: baseScale dipasang SETELAH scale.set (nilai sinkron)
    expect(src.indexOf('zl.scale.set(3.4*zsc,.64*zsc,1)')).toBeLessThan(src.indexOf('zl.userData.baseScale'))
  })
  it('OfficeScene menerapkan LOD SEBELUM buildZonePts (kolisi memakai ukuran digambar)', () => {
    const src = read('src/scene/OfficeScene.js')
    expect(src).toContain("import { applyZoneLod } from './parts/zone_lod.js'")
    expect(src).toMatch(/window\.__zoneLabels\.forEach\(zt=>applyZoneLod\(zt,camera\.position\.distanceTo\(zt\.position\)\)\)/)
    const applyIdx = src.indexOf('applyZoneLod(zt,camera.position.distanceTo')
    const buildIdx = src.indexOf('buildZonePts(zents,kz,pxW,pxH)')
    expect(applyIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeGreaterThan(applyIdx) // LOD dulu, box kolisi kemudian
  })
  it('modul zone_lod.js ada & konstanta terdokumentasi (clamp tak dilonggarkan diam-diam)', () => {
    const src = read('src/scene/parts/zone_lod.js')
    expect(src).toContain('export const ZLOD_FULL_DIST = 30')
    expect(src).toContain('export const ZLOD_MIN = 0.45')
    expect(src).toContain('export function zoneLodFactor')
    expect(src).toContain('export function applyZoneLod')
  })
})
