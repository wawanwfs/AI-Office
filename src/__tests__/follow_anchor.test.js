import { describe, it, expect } from 'vitest';
import { followAnchor, updateFollowGoal } from '../scene/parts/kamera_focus.js';

const cloneHome = () => ({ x: 0, y: 1.8, z: 0 });

describe('followAnchor (siklus 120 — follow peserta rapat)', () => {
  it('figAnchor (kursi rapat) MENANG atas walker/home', () => {
    const a = { walker: { visible: true, position: { x: 9, y: 0, z: 9 } }, home: { x: 1, z: 2 } };
    const out = followAnchor(a, { x: 8, y: 0.04, z: -3 });
    expect(out).toEqual({ x: 8, y: 0.04, z: -3 });
  });

  it('agen walker visible → posisi walker +1.5 (perilaku lama dipertahankan)', () => {
    const a = { walker: { visible: true, position: { x: 7, y: 0.2, z: -2 } } };
    expect(followAnchor(a, null)).toEqual({ x: 7, y: 1.7, z: -2 });
  });

  it('agen duduk (walker hidden) → home +1.5', () => {
    const a = { walker: { visible: false }, home: { x: 5, y: 0.6, z: 6 } };
    expect(followAnchor(a, null)).toEqual({ x: 5, y: 2.1, z: 6 });
  });

  it('elevasi lantai home.y dihitung (multi-lantai kampus)', () => {
    const a = { walker: { visible: false }, home: { x: 4, y: 1.2, z: 6 } };
    expect(followAnchor(a, null).y).toBeCloseTo(2.7);
  });

  it('null-safe: agen null tanpa figAnchor → null', () => {
    expect(followAnchor(null, null)).toBeNull();
  });

  it('null-safe: walker.visible tapi position hilang → null (dulu exception)', () => {
    const a = { walker: { visible: true }, home: null };
    expect(followAnchor(a, null)).toBeNull();
  });

  it('null-safe: tanpa home → null (bukan throw)', () => {
    expect(followAnchor({ walker: { visible: false } }, null)).toBeNull();
  });

  it('figAnchor dipakai apa pun kondisi agen (peserta: walker & home diabaikan)', () => {
    // Peserta rapat: walker hidden, home = meja kosong — anchor tetap kursi.
    const a = { walker: { visible: false }, home: { x: 1, z: 1 } };
    expect(followAnchor(a, { x: 8.2, y: 0.04, z: -3.4 })).toEqual({ x: 8.2, y: 0.04, z: -3.4 });
  });
});

describe('updateFollowGoal + figAnchor (siklus 120)', () => {
  const mkGoal = (follow) => ({
    t: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    follow,
    r: 20,
  });

  it('follow {meetIdx} → target = anchor kursi rapat per-frame', () => {
    const g = mkGoal({ meetIdx: 3, root: { home: { x: 1, z: 1 } } });
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome }, { x: 8.2, y: 0.04, z: -3.4 });
    expect(out).toBe(g);
    expect(g.t.x).toBe(8.2); expect(g.t.y).toBe(0.04); expect(g.t.z).toBe(-3.4);
  });

  it('rapat usai (figAnchor null) → jatuh ke root: meja home agen', () => {
    const g = mkGoal({ meetIdx: 3, root: { walker: { visible: false }, home: { x: 5, y: 0.6, z: 6 } } });
    updateFollowGoal(g, 30, 20, { clone: cloneHome }, null);
    expect(g.t.x).toBe(5); expect(g.t.y).toBe(2.1); expect(g.t.z).toBe(6);
  });

  it('tanpa figAnchor & follow {meetIdx} tanpa root valid → goal dipertahankan (t tak diubah)', () => {
    const g = mkGoal({ meetIdx: 3, root: null });
    g.t.set(2, 2, 2);
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome }, null);
    expect(out).toBe(g);
    expect(g.t.x).toBe(2); expect(g.t.y).toBe(2); expect(g.t.z).toBe(2);
  });

  it('follow root biasa (tanpa figAnchor) → perilaku lama eksak', () => {
    const g = mkGoal({ walker: { visible: true, position: { x: 7, y: 0, z: -2 } }, state: 'walking_out', home: { x: 3, z: 4 } });
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome }, null);
    expect(out).toBe(g);
    expect(g.t.x).toBe(7); expect(g.t.y).toBe(1.5); expect(g.t.z).toBe(-2);
  });

  it('offsite tetap → goal reset meski figAnchor diberikan (prioritas keadaan agen)', () => {
    const g = mkGoal({ walker: { visible: true, position: { x: 1, z: 1 } }, state: 'offsite', home: { x: 0, z: 0 } });
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome }, { x: 8, y: 0, z: -3 });
    expect(out.reset).toBe(true);
    expect(out.r).toBe(30);
    expect(out.follow).toBeUndefined();
  });

  it('homeRadius falsy → fallback radius di jalur reset (dipertahankan)', () => {
    const g = mkGoal({ walker: { visible: false }, state: 'offsite', home: { x: 0, z: 0 } });
    const out = updateFollowGoal(g, 0, 18, { clone: cloneHome }, null);
    expect(out.r).toBe(18);
  });
});
