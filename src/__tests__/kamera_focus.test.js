import { describe, it, expect } from 'vitest';
import { updateFollowGoal, focusStep, autoRotateStep, ensureHomeRadius, saveCam, resetFocusGoal } from '../scene/parts/kamera_focus.js';

const HOME = { x: 0, y: 1.8, z: 0 };
const cloneHome = () => ({ x: 0, y: 1.8, z: 0 });

describe('updateFollowGoal', () => {
  const mkGoal = (walker, state = 'walking_out', home = { x: 3, z: 4 }) => ({
    t: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    follow: { walker, state, home },
    r: 20,
  });

  it('target mengikuti posisi walker saat visible', () => {
    const g = mkGoal({ visible: true, position: { x: 7, y: 0, z: -2 } });
    const out = updateFollowGoal(g, 30, 20);
    expect(out).toBe(g);
    expect(g.t.x).toBe(7); expect(g.t.y).toBe(1.5); expect(g.t.z).toBe(-2);
  });

  it('target ke posisi home saat walker tidak visible', () => {
    const g = mkGoal({ visible: false }, 'walking_out', { x: 5, z: 6 });
    updateFollowGoal(g, 30, 20);
    expect(g.t.x).toBe(5); expect(g.t.y).toBe(1.5); expect(g.t.z).toBe(6);
  });

  it('target memperhitungkan elevasi lantai bertingkat (home.y > 0)', () => {
    const g = mkGoal({ visible: false }, 'walking_out', { x: 4, y: 1.20, z: 6 });
    updateFollowGoal(g, 30, 20);
    expect(g.t.x).toBe(4); expect(g.t.y).toBeCloseTo(2.70); expect(g.t.z).toBe(6);
  });

  it('agent offsite → goal reset ke HOME dengan r = homeRadius', () => {
    const g = mkGoal({ visible: true, position: { x: 1, z: 1 } }, 'offsite');
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome });
    expect(out.reset).toBe(true);
    expect(out.t).toEqual(HOME);
    expect(out.r).toBe(30);
    expect(out.follow).toBeUndefined();
  });

  it('homeRadius falsy → fallback radius', () => {
    const g = mkGoal({ visible: false }, 'offsite', { x: 0, z: 0 });
    const out = updateFollowGoal(g, 0, 18, { clone: cloneHome });
    expect(out.r).toBe(18);
  });

  it('agent non-offsite tidak berubah jadi reset', () => {
    const g = mkGoal({ visible: true, position: { x: 1, z: 1 } });
    const out = updateFollowGoal(g, 30, 20);
    expect(out.reset).toBeUndefined();
  });
});

describe('focusStep', () => {
  it('lerp menuju goal (faktor 0.06) untuk target & radius', () => {
    const tgt = { x: 0, y: 1.8, z: 0 };
    const sph = { radius: 40 };
    focusStep(tgt, sph, { x: 10, y: 1.8, z: 0 }, 20);
    expect(tgt.x).toBeCloseTo(0.6);
    expect(sph.radius).toBeCloseTo(38.8);
  });

  it('konvergen: berulang mendekati goal lalu selesai (<.05 dari HOME)', () => {
    const tgt = { x: 8, y: 1.8, z: 0 };
    const sph = { radius: 30 };
    let done = false;
    for (let i = 0; i < 400; i++) done = focusStep(tgt, sph, HOME, 20);
    expect(done).toBe(true);
    expect(tgt.x).toBeCloseTo(0, 1);
    expect(sph.radius).toBeCloseTo(20, 0);
  });

  it('belum selesai saat jauh', () => {
    const tgt = { x: 5, y: 1.8, z: 0 };
    expect(focusStep(tgt, { radius: 20 }, HOME, 20)).toBe(false);
  });

  it('jarak dihitung dari HOME_TGT y=1.8 (pergeseran y memengaruhi)', () => {
    const tgt = { x: 0, y: 1.86, z: 0 }; // deviasi y 0.06 → jarak .06 ≥ .05
    expect(focusStep(tgt, { radius: 20 }, HOME, 20)).toBe(false);
  });

  it('lerp sudut pitch (phi) bila goalPhi disediakan', () => {
    const tgt = { x: 0, y: 1.8, z: 0 };
    const sph = { radius: 20, phi: 0.35 };
    focusStep(tgt, sph, HOME, 20, 1.05);
    expect(sph.phi).toBeCloseTo(0.35 + (1.05 - 0.35) * 0.06);
  });

  it('guard: goal non-finite (NaN/±Infinity) → no-op, tgt/sph tak tertulari', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const tgt = { x: 0, y: 1.8, z: 0 };
      const sph = { radius: 40 };
      expect(focusStep(tgt, sph, { x: bad, y: 1.8, z: 0 }, 20)).toBe(false);
      expect(tgt).toEqual({ x: 0, y: 1.8, z: 0 });
      expect(sph.radius).toBe(40);
    }
  });

  it('guard: radius goal non-finite → no-op (bukan NaN tersimpan)', () => {
    const tgt = { x: 0, y: 1.8, z: 0 };
    const sph = { radius: 40 };
    expect(focusStep(tgt, sph, { x: 10, y: 1.8, z: 0 }, NaN)).toBe(false);
    expect(tgt.x).toBe(0);
    expect(sph.radius).toBe(40);
  });

  it('guard: goalPhi non-finite → phi tak ikut lerp, x/y/z/radius tetap jalan', () => {
    const tgt = { x: 0, y: 1.8, z: 0 };
    const sph = { radius: 20, phi: 0.35 };
    focusStep(tgt, sph, { x: 10, y: 1.8, z: 0 }, 20, NaN);
    expect(sph.phi).toBe(0.35);
    expect(tgt.x).toBeCloseTo(0.6);
    expect(sph.radius).toBeCloseTo(20);
  });
});

describe('autoRotateStep', () => {
  it('theta bertambah 0.0012 per langkah', () => {
    const sph = { theta: 1 };
    autoRotateStep(sph);
    expect(sph.theta).toBeCloseTo(1.0012);
    autoRotateStep(sph);
    expect(sph.theta).toBeCloseTo(1.0024);
  });
});

// ── Siklus 115: helper interaksi kamera (null-safe) ──
describe('ensureHomeRadius', () => {
  it('null → nilai baru di-clamp 24..70, saved=true', () => {
    const a = ensureHomeRadius(null, 10);
    expect(a).toEqual({ homeRadius: 24, saved: true });
    expect(ensureHomeRadius(null, 90).homeRadius).toBe(70);
    expect(ensureHomeRadius(null, 42.5).homeRadius).toBe(42.5);
  });
  it('sudah ada → return nilai lama tanpa saved', () => {
    expect(ensureHomeRadius(30, 50)).toEqual({ homeRadius: 30, saved: false });
    expect(ensureHomeRadius(30, 10).homeRadius).toBe(30);
  });
  it('undefined diperlakukan seperti null', () => {
    expect(ensureHomeRadius(undefined, 40)).toEqual({ homeRadius: 40, saved: true });
  });
  it('radius non-finite → fallback 42.5 (bukan NaN tersimpan)', () => {
    expect(ensureHomeRadius(null, NaN).homeRadius).toBe(42.5);
    expect(ensureHomeRadius(null, undefined).homeRadius).toBe(42.5);
  });
});

describe('saveCam', () => {
  it('snapshot pose sekali; panggilan berikutnya no-op (return false)', () => {
    const sph = { theta: 1.1, phi: 0.9, radius: 44 };
    expect(saveCam(sph)).toBe(true);
    expect(sph.__saved).toEqual({ theta: 1.1, phi: 0.9, radius: 44 });
    sph.theta = 9;
    expect(saveCam(sph)).toBe(false);
    expect(sph.__saved.theta).toBe(1.1);
  });
  it('radius NaN → snapshot pakai fallback 42.5 (pose selalu valid)', () => {
    const sph = { theta: 0.5, phi: 1.0, radius: NaN };
    saveCam(sph);
    expect(sph.__saved.radius).toBe(42.5);
  });
  it('null/undefined sph → false tanpa error', () => {
    expect(saveCam(null)).toBe(false);
    expect(saveCam(undefined)).toBe(false);
  });
  it('__saved sudah ada → false (tidak menimpa snapshot lama)', () => {
    const sph = { theta: 2, phi: 1, radius: 30, __saved: { theta: 0, phi: 0.8, radius: 60 } };
    expect(saveCam(sph)).toBe(false);
    expect(sph.__saved.radius).toBe(60);
  });
});

describe('resetFocusGoal', () => {
  const H = { x: 0, y: 1.4, z: 0.3 };
  it('goal reset: clone HOME_TGT (bukan referensi), r=homeRadius, reset=true', () => {
    const g = resetFocusGoal(H, 35, 50);
    expect(g.reset).toBe(true);
    expect(g.t).toEqual(H);
    expect(g.t).not.toBe(H);
    expect(g.r).toBe(35);
  });
  it('homeRadius null → fallback radius (REGRESI siklus 115: dulu r=null → lerp radius meluruh ke ~0, kamera runtuh)', () => {
    const g = resetFocusGoal(H, null, 44);
    expect(g.r).toBe(44);
    expect(Number.isFinite(g.r)).toBe(true);
  });
  it('homeRadius undefined/NaN → fallback juga', () => {
    expect(resetFocusGoal(H, undefined, 44).r).toBe(44);
    expect(resetFocusGoal(H, NaN, 44).r).toBe(44);
  });
  it('fallback non-finite (mis. sph.radius NaN) → 42.5; goal.r SELALU finite', () => {
    const g = resetFocusGoal(H, null, NaN);
    expect(g.r).toBe(42.5);
    expect(Number.isFinite(g.r)).toBe(true);
  });
  it('homeRadius 0 (falsy) → fallback, konsisten dgn updateFollowGoal', () => {
    expect(resetFocusGoal(H, 0, 18).r).toBe(18);
  });
  it('homeT polos (tanpa clone) → disalin dangkal', () => {
    const t = { x: 1, y: 2, z: 3 };
    const g = resetFocusGoal(t, 30, 20);
    expect(g.t).toEqual(t);
    expect(g.t).not.toBe(t);
  });
  it('updateFollowGoal offsite kini memakai resetFocusGoal (hasil identik dgn kontrak lama)', () => {
    const g = {
      t: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      follow: { walker: { visible: true, position: { x: 1, z: 1 } }, state: 'offsite', home: { x: 3, z: 4 } },
      r: 20,
    };
    const out = updateFollowGoal(g, null, 20, { clone: cloneHome });
    expect(out.reset).toBe(true);
    expect(out.t).toEqual(HOME);
    expect(out.r).toBe(20); // homeRadius null → fallback
  });
});
