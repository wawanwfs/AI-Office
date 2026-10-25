import { describe, it, expect } from 'vitest';
import { updateFollowGoal, focusStep, autoRotateStep } from '../scene/parts/kamera_focus.js';

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
