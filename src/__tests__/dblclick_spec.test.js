import { describe, it, expect } from 'vitest';
import { dblclickPointGoal, dblclickBlankGoal } from '../scene/parts/dblclick_spec.js';
import { agentFocusPos } from '../scene/parts/kamera_focus.js';

// Siklus 118 — perilaku dblclick kanvas (diekstrak dari inline OfficeScene).
// Regresi: dblclick agen/nexus dulu jatuh ke goal titik generik STATIS tanpa
// follow → menimpa goal follow klik pertama (kamera berhenti mengikuti agen
// berjalan); jalur agen juga skip saveCam/ensureHomeRadius (Escape rusak).

describe('agentFocusPos (kamera_focus)', () => {
  it('walker visible → posisi walker +1.5 (formula sama dgn updateFollowGoal)', () => {
    const a = { home: { x: 4, y: 0, z: 1.5 }, walker: { visible: true, position: { x: -2, y: 1.2, z: 7 } } };
    expect(agentFocusPos(a)).toEqual({ x: -2, y: 2.7, z: 7 });
  });
  it('walker tidak visible → posisi home +1.5 (bukan null)', () => {
    const a = { home: { x: 4, y: 0, z: 1.5 }, walker: { visible: false, position: { x: 99, y: 0, z: 99 } } };
    expect(agentFocusPos(a)).toEqual({ x: 4, y: 1.5, z: 1.5 });
  });
  it('home bertingkat (y=3.2) → elevasi lantai dihitung', () => {
    const a = { home: { x: 1, y: 3.2, z: 2 }, walker: { visible: false } };
    expect(agentFocusPos(a)).toEqual({ x: 1, y: 4.7, z: 2 });
  });
  it('agen tanpa home → null (dulu formula lama melempar exception)', () => {
    expect(agentFocusPos(null)).toBeNull();
    expect(agentFocusPos({})).toBeNull();
    expect(agentFocusPos({ walker: { visible: true, position: { x: 1, y: 0, z: 1 } } })).toBeNull();
  });
});

describe('dblclickPointGoal', () => {
  it('goal titik: y di-clamp ≥ +0.8, r = min(radius, 18)', () => {
    const g = dblclickPointGoal({ x: 3, y: 0.2, z: -5 }, 30);
    expect(g).toEqual({ t: { x: 3, y: 1.5, z: -5 }, r: 18 });
  });
  it('radius kecil (25) dipertahankan min(25,18)=18; y tinggi ikut +0.8', () => {
    const g = dblclickPointGoal({ x: 0, y: 4.4, z: 0 }, 25);
    expect(g.r).toBe(18);
    expect(g.t.y).toBeCloseTo(5.2);
  });
  it('point y undefined → 0 + 0.8 clamp 1.5', () => {
    const g = dblclickPointGoal({ x: 1, z: 1 }, 40);
    expect(g.t.y).toBe(1.5);
  });
  it('null/koordinat tak valid → null (goal lama dibiarkan)', () => {
    expect(dblclickPointGoal(null, 40)).toBeNull();
    expect(dblclickPointGoal({ x: NaN, y: 0, z: 1 }, 40)).toBeNull();
    expect(dblclickPointGoal({ x: 1, y: 0, z: undefined }, 40)).toBeNull();
  });
  it('radius NaN/undefined → fallback 42.5 lalu min(…,18)=18', () => {
    expect(dblclickPointGoal({ x: 1, y: 0, z: 1 }, NaN).r).toBe(18);
    expect(dblclickPointGoal({ x: 1, y: 0, z: 1 }, undefined).r).toBe(18);
  });
});

describe('dblclickBlankGoal', () => {
  it('area kosong: maju 30% (r = max(14, radius*0.7)) ke target orbit', () => {
    const g = dblclickBlankGoal({ x: 0, y: 1.0, z: 0.6 }, 40);
    expect(g.r).toBe(28);
    expect(g.t).toEqual({ x: 0, y: 1.0, z: 0.6 });
  });
  it('radius kecil → floor 14 (tidak lebih dekat dari 14)', () => {
    expect(dblclickBlankGoal({ x: 0, y: 1, z: 0 }, 18).r).toBe(14);
  });
  it('tgt tak valid → fallback target HOME (0,1,0.6)', () => {
    expect(dblclickBlankGoal(null, 40).t).toEqual({ x: 0, y: 1.0, z: 0.6 });
    expect(dblclickBlankGoal({ x: NaN, y: 1, z: 0 }, 40).t).toEqual({ x: 0, y: 1.0, z: 0.6 });
  });
  it('tgt.y undefined → 1.0', () => {
    expect(dblclickBlankGoal({ x: 5, z: 5 }, 40).t.y).toBe(1.0);
  });
});
