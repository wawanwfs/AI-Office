// Siklus 146: lantai kamera LIVE — pelapor terpusat per-frame (murni).
//
// Keluarga bug siklus 142–145 ditutup: dulu tiap jalur fokus melaporkan lantai
// SEKALI di titik klik (onSelectAgent/onCameraFloor). Tiga jalur lolos:
//   1. FOLLOW: kamera mengikuti agen yang BERJALAN lintas lantai (rapat→L1,
//      lunch kafe→L3, pulang) — nav beku di lantai saat agen diklik.
//   2. Klik papan proyek (single + dblclick): goal z=13.2 dinding belakang (L3)
//      tanpa laporan — panel proyek terbuka, nav tetap di lantai lama.
//   3. dblclick nexus: goal z=6.1 (L3) tanpa onSelectAgent.
// Kini animate() menghitung lantai TARGET GOAL tiap frame via goalFloor murni
// (kamera_focus.js) dan hanya memanggil onCameraFloor saat lantai BERUBAH
// (cameraFloorFrame — latch). Goal reset/menuju HOME_TGT (klik kosong, Escape,
// resetFocus) & dblclick area kosong = kembali ke overview, BUKAN pindah
// lantai → null (tidak melaporkan, latch di-reset).
import { describe, it, expect } from 'vitest'
import { goalFloor, cameraFloorFrame } from '../scene/parts/kamera_focus.js'

const HOME = { x: 0, y: 1.4, z: 0.3 } // HOME_TGT scene
const V = (z) => ({ t: { x: 0, y: 1.5, z }, r: 18 })

describe('goalFloor — goal statis (klik papan proyek / nexus / pod tim)', () => {
  it('BUG UTAMA: klik papan proyek (goal z=13.2, tanpa follow/reset) → L3', () => {
    expect(goalFloor(V(13.2), HOME)).toBe(3)
  })

  it('BUG UTAMA: dblclick nexus (goal z=6.1) → L3 tanpa onSelectAgent', () => {
    expect(goalFloor(V(6.1), HOME)).toBe(3)
  })

  it('pod tim di z=2 (core-be) → L2; ruang rapat z=-3 (MRZ) → L1', () => {
    expect(goalFloor(V(2), HOME)).toBe(2)
    expect(goalFloor(V(-3), HOME)).toBe(1)
  })

  it('goal follow agen: agentLiveLevel menang atas levelOf(goal.t.z) — peserta rapat (figur L1) dari goal meja kosong L2 → L1', () => {
    const g = { t: { x: 4, y: 1.5, z: 1.5 }, r: 20, follow: { state: 'meeting', home: { x: 4, z: 1.5 }, walker: { visible: false, position: { z: 1.5 } }, sittingChar: { visible: true, position: { z: 1.5 } } } }
    expect(goalFloor(g, HOME)).toBe(1) // ROOM_CZ=-3 → levelOf → 1
  })

  it('goal follow agen berjalan: walker.visible → lantai posisi walker LIVE (bukan meja)', () => {
    const g = { t: { x: 0, y: 1.5, z: -2.5 }, r: 20, follow: { walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false }, home: { x: 0, z: -2.5 } } }
    expect(goalFloor(g, HOME)).toBe(3) // lunch kafe L3
  })

  it('guard: goal korup (tanpa t / z non-finite) → null, bukan lantai karangan', () => {
    expect(goalFloor(null, HOME)).toBeNull()
    expect(goalFloor({}, HOME)).toBeNull()
    expect(goalFloor({ t: { z: NaN } }, HOME)).toBeNull()
    expect(goalFloor({ t: { z: undefined } }, HOME)).toBeNull()
  })

  it('goal reset menuju HOME_TGT → null (kembali ke overview ≠ pindah lantai)', () => {
    expect(goalFloor({ t: { x: 0, y: 1.4, z: 0.3 }, r: 42.5, reset: true }, HOME)).toBeNull()
  })

  it('goal reset dgn target asing (bukan home) → tetap dilaporkan (levelOf)', () => {
    expect(goalFloor({ t: { x: 0, y: 1.4, z: 6 }, r: 20, reset: true }, HOME)).toBe(3)
  })

  it('dblclick area kosong (flag blank) → null meski kamera di rumah (z tgt 0.3 → bukan "L2" palsu)', () => {
    expect(goalFloor({ t: { x: 0, y: 1, z: 0.3 }, r: 30, blank: true }, HOME)).toBeNull()
    // dgn tgt jauh (kamera sedang fokus L3): tetap null — zoom idle, bukan lantai
    expect(goalFloor({ t: { x: 0, y: 1, z: 8 }, r: 30, blank: true }, HOME)).toBeNull()
  })
})

describe('cameraFloorFrame — latch per-frame (callback hanya saat lantai berubah)', () => {
  it('latch: sama → changed=false; beda → changed=true + level baru', () => {
    expect(cameraFloorFrame(V(13.2), 3, HOME)).toEqual({ level: 3, changed: false })
    expect(cameraFloorFrame(V(13.2), 1, HOME)).toEqual({ level: 3, changed: true })
    expect(cameraFloorFrame(V(-3), 3, HOME)).toEqual({ level: 1, changed: true })
  })

  it('goal null/reset/blank → level null (pemicu reset latch), tanpa changed', () => {
    expect(cameraFloorFrame(null, 2, HOME)).toEqual({ level: null, changed: false })
    expect(cameraFloorFrame({ t: { x: 0, y: 1.4, z: 0.3 }, reset: true }, 2, HOME)).toEqual({ level: null, changed: false })
  })

  it('siklus nyata: L1→(papan L3)→(reset null)→(papan L3 lagi) — langkah ketiga HARUS terlapor lagi', () => {
    let last = 1
    let f = cameraFloorFrame(V(13.2), last, HOME); last = f.level
    expect(f).toEqual({ level: 3, changed: true })
    f = cameraFloorFrame({ t: { x: 0, y: 1.4, z: 0.3 }, reset: true }, last, HOME); last = f.level
    expect(last).toBeNull() // overview: latch di-reset
    f = cameraFloorFrame(V(13.2), last, HOME)
    expect(f).toEqual({ level: 3, changed: true }) // tanpa reset latch: false → nav mati
  })

  it('follow lintas lantai LIVE: walker melewati batas 4.5 → laporan berubah per frame', () => {
    const ad = { walker: { visible: true, position: { z: 4.2 } }, sittingChar: { visible: false }, home: { x: 0, z: -2 } }
    const g = (a) => ({ t: { x: 0, y: 1.5, z: a.walker.position.z }, r: 20, follow: a })
    let last = 2
    let f = cameraFloorFrame(g(ad), last, HOME)
    expect(f.level).toBe(2) // z=4.2 masih L2
    last = f.level
    ad.walker.position.z = 4.9 // melewati batas
    f = cameraFloorFrame(g(ad), last, HOME)
    expect(f).toEqual({ level: 3, changed: true })
  })
})
