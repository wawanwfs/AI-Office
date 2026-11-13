import { describe, it, expect } from 'vitest';
import { printerCycle, PRINTER_CYCLE_SEC } from '../scene/parts/effects.js';

const mkMesh = (y = 1.0, opacity = 0) => ({
  position: { x: 0, y, z: 0 },
  material: { opacity },
  userData: {},
});
const mkLed = () => ({ material: { opacity: 1 } });

describe('printerCycle (siklus 489)', () => {
  it('guard: non-finite elapsed / parts kosong → 0, tanpa crash', () => {
    expect(printerCycle(NaN, { leds: [mkLed()], sheet: mkMesh() })).toBe(0);
    expect(printerCycle(1, null)).toBe(0);
    expect(printerCycle(undefined, {})).toBe(0);
  });

  it('LED berkedip dalam rentang [0.4, 1.0], lawan fase utk LED kedua', () => {
    const l1 = mkLed(), l2 = mkLed();
    const parts = { leds: [l1, l2], sheet: null };
    for (let t = 0; t <= 10; t += 0.25) {
      printerCycle(t, parts);
      expect(l1.material.opacity).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(l1.material.opacity).toBeLessThanOrEqual(1 + 1e-9);
    }
    printerCycle(1.25, parts); // lawan fase: jumlah ≈ 1.4
    expect(Math.abs((l1.material.opacity + l2.material.opacity) - 1.4)).toBeLessThan(1e-6);
  });

  it('kertas diam (opacity 0) pada 30% awal siklus, naik ≤0.28 sesudahnya', () => {
    const sheet = mkMesh(1.0);
    printerCycle(0.1 * PRINTER_CYCLE_SEC, { sheet });
    expect(sheet.material.opacity).toBe(0);
    expect(sheet.position.y).toBe(1.0);
    printerCycle(0.5 * PRINTER_CYCLE_SEC, { sheet }); // k ≈ (0.5-0.3)/0.7 ≈ 0.286
    expect(sheet.position.y).toBeGreaterThan(1.0);
    expect(sheet.position.y).toBeLessThanOrEqual(1.28 + 1e-9);
    printerCycle(0.99 * PRINTER_CYCLE_SEC, { sheet });
    expect(sheet.position.y).toBeCloseTo(1.28, 1);
  });

  it('baseY di-latch panggilan pertama (pola plantSway/coffeeSteam)', () => {
    const sheet = mkMesh(2.5);
    printerCycle(1, { sheet });
    expect(sheet.userData.baseY).toBe(2.5);
    printerCycle(0.9 * PRINTER_CYCLE_SEC, { sheet });
    expect(sheet.position.y).toBeCloseTo(2.78, 1); // 2.5 + 0.28
  });

  it('deterministik: elapsed sama → hasil sama', () => {
    const a = { leds: [mkLed()], sheet: mkMesh() };
    const b = { leds: [mkLed()], sheet: mkMesh() };
    printerCycle(3.7, a); printerCycle(3.7, b);
    expect(a.sheet.position.y).toBe(b.sheet.position.y);
    expect(a.leds[0].material.opacity).toBeCloseTo(b.leds[0].material.opacity, 12);
  });

  it('kontinu di seam siklus (t≈CYCLE → wrap mulus ke t≈0)', () => {
    const s1 = mkMesh(1.0), s2 = mkMesh(1.0);
    printerCycle(PRINTER_CYCLE_SEC - 0.001, { sheet: s1 });
    printerCycle(0.001, { sheet: s2 });
    // keduanya masih di fase eject akhir vs idle awal — posisi wrap: akhir ≈ 1.28, awal siklus berikut t kecil <0.3 → base
    expect(s2.position.y).toBe(1.0);
  });

  it('struktur rusak (led tanpa material, sheet tanpa position) → tidak crash', () => {
    expect(printerCycle(2, { leds: [null, {}], sheet: {} })).toBe(0);
    expect(printerCycle(2, {})).toBe(0);
  });
});
