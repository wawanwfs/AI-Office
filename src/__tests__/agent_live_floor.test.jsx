// @vitest-environment jsdom
// Unit test siklus 142: badge Lokasi Lantai AgentInspector kini LIVE dari posisi
// karakter scene — dulu statis dari agent.floor (meja) yang di-set sekali saat
// build, padahal agen berpindah lantai (rapat L1, kafe L3, jalan kampus, pulang).
import { describe, it, expect } from 'vitest'
import { levelOf, floorZoneName, agentLiveLevel } from '../scene/parts/agent_status.js'

describe('levelOf (murni) — z → nomor lantai, batas SAMA dgn penugasan meja scene', () => {
  it('z < -0.8 → L1 (baris meja L1 z=-3/-5, atrium)', () => {
    expect(levelOf(-3)).toBe(1)
    expect(levelOf(-5)).toBe(1)
    expect(levelOf(-0.81)).toBe(1)
    expect(levelOf(-12)).toBe(1)
  })
  it('-0.8 ≤ z ≤ 4.5 → L2 (mezzanine z=1/1.5)', () => {
    expect(levelOf(-0.8)).toBe(2)
    expect(levelOf(0)).toBe(2)
    expect(levelOf(1.5)).toBe(2)
    expect(levelOf(4.5)).toBe(2)
  })
  it('z > 4.5 → L3 (penthouse/kafe z=5.6/7/9)', () => {
    expect(levelOf(4.51)).toBe(3)
    expect(levelOf(5.6)).toBe(3)
    expect(levelOf(7)).toBe(3)
    expect(levelOf(10.5)).toBe(3)
  })
  it('anti-poisoning: z non-finite / bukan number → null (fallback meja, bukan lantai karangan)', () => {
    expect(levelOf(NaN)).toBeNull()
    expect(levelOf(Infinity)).toBeNull()
    expect(levelOf(-Infinity)).toBeNull()
    expect(levelOf(undefined)).toBeNull()
    expect(levelOf('3')).toBeNull()
    expect(levelOf(null)).toBeNull()
  })
})

describe('floorZoneName (murni) — label zona konsisten dgn label eksisting', () => {
  it('1→Ops & AI, 2→Engineering, 3→Executive', () => {
    expect(floorZoneName(1)).toBe('Ops & AI')
    expect(floorZoneName(2)).toBe('Engineering')
    expect(floorZoneName(3)).toBe('Executive')
  })
  it('lantai tak dikenal → null (bukan teks palsu)', () => {
    expect(floorZoneName(0)).toBeNull()
    expect(floorZoneName(4)).toBeNull()
    expect(floorZoneName(undefined)).toBeNull()
    expect(floorZoneName(null)).toBeNull()
  })
})

describe('agentLiveLevel (murni) — lantai dari posisi karakter scene', () => {
  it('walker visible → lantai dari posisi walker (agen sedang berjalan)', () => {
    const ad = {
      walker: { visible: true, position: { z: 5.6 } },
      sittingChar: { visible: false, position: { z: -3 } },
      home: { z: -3 },
    }
    expect(agentLiveLevel(ad)).toBe(3)
  })
  it('walker hidden → lantai dari sittingChar (duduk / peserta rapat)', () => {
    // Peserta rapat: sittingChar disembunyikan, figur rapat di L1 (z=-3),
    // tapi label mengikuti kursi rapat — posisi terbaik yang tersedia = home/
    // sittingChar; di scene nyata agen L3 rapat HARUS dilabeli L1.
    const ad = {
      walker: { visible: false, position: { z: 7 } },
      sittingChar: { visible: true, position: { z: 7 } },
      home: { z: 7 },
    }
    expect(agentLiveLevel(ad)).toBe(3)
  })
  it('koordinat korup (NaN) dilewati → fallback kandidat berikutnya, bukan null salah arah', () => {
    const ad = {
      walker: { visible: true, position: { z: NaN } },
      sittingChar: { visible: true, position: { z: 1.5 } },
      home: { z: -3 },
    }
    expect(agentLiveLevel(ad)).toBe(2)
  })
  it('peserta rapat → lantai ruang meeting dari spesifikasi (ROOM_CZ → L1), bukan lantai meja', () => {
    expect(agentLiveLevel({ state: 'meeting', walker: { visible: false, position: { z: 6 } }, sittingChar: { visible: false, position: { z: 6 } }, home: { z: 6 } })).toBe(1)
    // state korup bukan 'meeting' → jatuh ke jalur posisi biasa
    expect(agentLiveLevel({ state: 123, home: { z: 6 } })).toBe(3)
  })
  it('semua koordinat absen → null (fallback agent.floor di komponen)', () => {
    expect(agentLiveLevel({})).toBeNull()
    expect(agentLiveLevel(null)).toBeNull()
    expect(agentLiveLevel('korup')).toBeNull()
  })
  it('regresi batas scene: agen meja L1 (z=-3) → 1, L2 (z=1.5) → 2, L3 (z=6) → 3', () => {
    const mk = (z) => ({ walker: { visible: false, position: { z } }, sittingChar: { visible: true, position: { z } }, home: { z } })
    expect(agentLiveLevel(mk(-3))).toBe(1)
    expect(agentLiveLevel(mk(1.5))).toBe(2)
    expect(agentLiveLevel(mk(6))).toBe(3)
  })
})
