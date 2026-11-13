import { describe, it, expect } from 'vitest';
import { serverHum, SERVER_HUM_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('serverHum (siklus 498)', () => {
  it('guard nilai non-finite → netral (0.98 = 0.78+0.09+0.04·… ) tanpa melempar', () => {
    // t=0: main=0.5, micro=0.5 → 0.78+0.09+0.02 = 0.89
    near(serverHum(NaN), 0.89);
    near(serverHum(undefined), 0.89);
    expect(Number.isFinite(serverHum(Infinity))).toBe(true);
  });

  it('berdenyut — tak padam total, rentang 0.78…1.0', () => {
    const N = 600;
    const vals = Array.from({ length: N }, (_, i) => serverHum(i * 0.03));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.78 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.15);
  });

  it('deterministik + periodik: kontinu di seam siklus penuh', () => {
    near(serverHum(1.3), serverHum(1.3));
    [0.4, 1.7, 3.1].forEach((t) => {
      // seam gabungan: main (T) & micro (2.73T) — LCM = 273T utk 2.73 exact
      near(serverHum(t), serverHum(t + SERVER_HUM_SEC * 273), 1e-6);
    });
    expect(SERVER_HUM_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: puncak main eksak, rentang mikro wajar', () => {
    // main puncak saat t = T/4 — micro di situ fase 1/(2·2.73) putaran (≈0.183)…
    const p = serverHum(SERVER_HUM_SEC / 4);
    near(p, 0.78 + 0.18 + 0.04 * wAt(SERVER_HUM_SEC / 4, SERVER_HUM_SEC * 2.73), 1e-9);
    // main lembah t = 3T/4 → di bawah 0.9 tapi tak pernah di bawah 0.78
    const valley = serverHum(SERVER_HUM_SEC * 3 / 4);
    expect(valley).toBeLessThan(0.9);
    expect(valley).toBeGreaterThan(0.78);
  });

  it('mikro-gelombang menambah tekstur: nilai bervariasi di puncak main', () => {
    const a = serverHum(SERVER_HUM_SEC / 4);
    const b = serverHum(SERVER_HUM_SEC / 4 + SERVER_HUM_SEC * 2.73 / 2);
    // di puncak main, micro bergeser 180° → total turun, bukan identik
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.78);
  });
});

// replika lokal gelombang mikro utk kontrak eksak (sama dgn implementasi)
function wAt(t, sec) {
  return 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
}
