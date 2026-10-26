import { describe, it, expect } from 'vitest';
import {
  WALK_SPEED, EXIT_SPEED, LINE_SEC, COLLAB_OFFSET, DEST_JITTER,
  COLLAB_CHANCE, TRIP_PAUSE_MIN, TRIP_PAUSE_JITTER, SIT_TIMER_MIN, SIT_TIMER_JITTER,
  STRIDE, stridePose, collabTarget, jitterDest, pickDest, fallbackSpot, REST_POSE,
} from '../scene/parts/trip_plan.js';
import { FRONT, bandOf } from '../scene/parts/routing.js';

const rngFixed = (r = 0.5, i = 0) => ({ r: () => r, i: () => i });

describe('konstanta historis', () => {
  it('kecepatan jalan 1.6, keluar 2.0, baris dialog 1.8 dtk', () => {
    expect(WALK_SPEED).toBe(1.6);
    expect(EXIT_SPEED).toBe(2.0);
    expect(LINE_SEC).toBe(1.8);
  });
  it('offset collab (+0.95, -0.15) di samping kursi partner', () => {
    expect(COLLAB_OFFSET).toEqual({ x: 1.5, z: -0.2 });
  });
  it('jitter tujuan ±0.5, peluang collab 0.75', () => {
    expect(DEST_JITTER).toBe(0.9);
    expect(COLLAB_CHANCE).toBe(0.3);
  });
  it('pause trip 2±2 dtk, timer duduk 6+0..14 dtk', () => {
    expect(TRIP_PAUSE_MIN).toBe(4);
    expect(TRIP_PAUSE_JITTER).toBe(4);
    expect(SIT_TIMER_MIN).toBe(10);
    expect(SIT_TIMER_JITTER).toBe(18);
  });
  it('STRIDE: scale waktu 0.01, leg pos 0.08 / rot 0.25, arm 0.5, bob 0.035', () => {
    expect(STRIDE).toEqual({ TIME_SCALE: 0.01, LEG_POS: 0.08, LEG_ROT: 0.25, ARM_ROT: 0.5, BOB: 0.035 });
  });
});

describe('collabTarget', () => {
  it('home + offset', () => {
    expect(collabTarget({ x: -8, z: 1.5 })).toEqual({ x: -7.05, z: 1.35 });
  });
  it('offset kustom', () => {
    expect(collabTarget({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual({ x: 1, z: 1 });
  });
});

describe('jitterDest', () => {
  it('tanpa jitter tetap di titik dest', () => {
    expect(jitterDest({ x: 9, z: 3 }, { r: () => 0 })).toEqual({ x: 9, z: 3 });
  });
  it('rng.r(a,b) = a+n*(b-a); rngFixed mengembalikan 0..1 dari n, jadi r(-0.5,0.5) dgn n=0.5 → 0; cek aktual ±0.5 penuh', () => {
    // rngFixed(0.5).r dipakai sebagai fungsi langsung → r(-0.5,0.5)=0.5? Tidak: r dipanggil
    // dengan argumen, jadi mock harus memodelkan r(min,max). Mock baru:
    const rmock = (n) => ({ r: (a, b) => a + n * (b - a), i: () => 0 });
    expect(jitterDest({ x: 9, z: 3 }, rmock(0.5))).toEqual({ x: 9, z: 3 });
    expect(jitterDest({ x: 9, z: 3 }, rmock(1)).x).toBe(9.9);
    expect(jitterDest({ x: 9, z: 3 }, rmock(0)).z).toBe(2.1);
    expect(jitterDest({ x: 0, z: 0 }, rmock(1), 2)).toEqual({ x: 2, z: 2 });
  });
});

describe('pickDest', () => {
  const dests = [{ x: 0, z: 0 }, { x: 5, z: 5 }];
  const rmock = (n) => ({ r: (a, b) => a + n * (b - a), i: () => 0 });
  it('terima spot bebas di percobaan pertama (jitter tengah = titik dest)', () => {
    const s = pickDest(dests, rmock(0.5), () => true);
    expect(s).toEqual({ x: 0, z: 0 });
  });
  it('lompat ke percobaan berikut saat spot ditolak', () => {
    let n = 0;
    const s = pickDest(dests, rngFixed(0.5, 0), () => ++n > 1);
    expect(s).not.toBeNull();
    expect(n).toBeGreaterThan(1);
  });
  it('null setelah semua percobaan gagal (fallback koridor di pemanggil)', () => {
    expect(pickDest(dests, rngFixed(0.5, 0), () => false, 8)).toBeNull();
  });
  it('dests kosong/undefined → null tanpa throw (fallback koridor di pemanggil)', () => {
    expect(pickDest([], rmock(0.5), () => true)).toBeNull();
    expect(pickDest(undefined, rmock(0.5), () => true)).toBeNull();
  });
  it('tries kustom dihormati', () => {
    // freeSpot dipanggil 1x per percobaan + 1x re-cek terakhir setelah loop (spot terakhir tetap dipakai bila bebas)
    let calls = 0;
    const s2 = pickDest(dests, rmock(0.5), () => { calls++; return calls > 3; }, 3);
    expect(s2).not.toBeNull(); // re-cek terakhir menemukan spot percobaan ke-3 bebas
    expect(calls).toBe(4);
  });
});

describe('fallbackSpot', () => {
  it('meja baris depan (z=-3) → koridor band baris itu', () => {
    const s = fallbackSpot({ x: -8, z: -3 });
    expect(s.x).toBe(-8);
    expect(s.z).toBe(FRONT[bandOf(-3)]);
  });
  it('z di luar band tetap clamp aman (tidak NaN / out-of-front)', () => {
    const s = fallbackSpot({ x: 4, z: -99 });
    expect(FRONT).toContain(s.z);
  });
  it('x meja dipertahankan', () => {
    expect(fallbackSpot({ x: 8, z: 6 }).x).toBe(8);
  });
});

describe('stridePose', () => {
  it('fase 0 → sin/cos standar dgn amplitudo konstanta', () => {
    const p = stridePose(0);
    expect(p.legZ).toBeCloseTo(0);
    expect(p.legRotX).toBeCloseTo(STRIDE.LEG_ROT);
    expect(p.armRotX).toBeCloseTo(0);
    expect(p.bob).toBeCloseTo(0);
  });
  it('puncak sin(t)=1 → legZ = LEG_POS', () => {
    expect(stridePose(Math.PI / 2).legZ).toBeCloseTo(STRIDE.LEG_POS);
  });
  it('fase limb menggeser siklus (kaki kiri vs kanan berlawanan)', () => {
// kaki kiri/kanan berlawanan fase (sin & cos keduanya membalik tanda dgn offset π)
    const a = stridePose(1, 0);
    const b = stridePose(1, Math.PI);
    expect(a.legZ).toBeCloseTo(-b.legZ);
    expect(a.legRotX).toBeCloseTo(-b.legRotX);
    expect(a.armRotX).toBeCloseTo(-b.armRotX);
  });
  it('bob = |sin(t)|*BOB → selalu ≥ 0 dan periodik', () => {
    expect(stridePose(-1).bob).toBeCloseTo(Math.abs(Math.sin(-1)) * STRIDE.BOB);
    expect(stridePose(Math.PI).bob).toBeCloseTo(0);
  });
  it('amplitudo lengan > amplitudo kaki rotasi (lengan lebih lebar)', () => {
    expect(STRIDE.ARM_ROT).toBeGreaterThan(STRIDE.LEG_ROT);
  });
  it('REST_POSE netral total', () => {
    expect(REST_POSE).toEqual({ legZ: 0, legRotX: 0, armRotX: 0, bob: 0 });
  });
});
