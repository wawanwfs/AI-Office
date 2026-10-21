// Unit test tickSoundTimer (src/scene/parts/sound_spec.js) — pengatur waktu
// suara periodik keyclick/langkah kaki yang diekstrak dari animate() OfficeScene.
import { describe, it, expect } from 'vitest';
import { tickSoundTimer } from '../scene/parts/sound_spec.js';

describe('tickSoundTimer', () => {
  it('belum habis: tidak trigger, timer tinggal selisih delta', () => {
    const r = tickSoundTimer(0.32, 0.1, 0.32);
    expect(r.trigger).toBe(false);
    expect(r.timer).toBeCloseTo(0.22);
  });

  it('habis: trigger sekali dan reset ke interval angka', () => {
    const r = tickSoundTimer(0.05, 0.1, 0.32);
    expect(r.trigger).toBe(true);
    expect(r.timer).toBe(0.32);
  });

  it('habis: interval fungsi memakai rng (keyclick .09+rng*.18)', () => {
    const r = tickSoundTimer(0, 0.2, (rng) => 0.09 + rng() * 0.18, () => 0.5);
    expect(r.trigger).toBe(true);
    expect(r.timer).toBeCloseTo(0.18);
  });

  it('tepat nol: trigger (0 dianggap habis)', () => {
    expect(tickSoundTimer(0, 0.01, 0.5).trigger).toBe(true);
  });

  it('guard input non-numerik: trigger + timer 0 (tanpa throw)', () => {
    for (const [p, d] of [[NaN, 0.1], [0.3, NaN], [undefined, 0.1]]) {
      const r = tickSoundTimer(p, d, 0.4);
      expect(r.trigger).toBe(true);
      expect(r.timer).toBe(0);
    }
  });

  it('simulasi beruntun: jumlah trigger sesuai durasi total / interval (step .32)', () => {
    let t = 0, trig = 0;
    for (let i = 0; i < 600; i++) { // 10 detik @60fps
      const r = tickSoundTimer(t, 1 / 60, 0.32);
      t = r.timer; if (r.trigger) trig++;
    }
    expect(trig).toBeGreaterThanOrEqual(29); // 10s / .32 ≈ 31
    expect(trig).toBeLessThanOrEqual(33);
  });
});
