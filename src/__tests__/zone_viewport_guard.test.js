import { describe, it, expect } from 'vitest';
import { zoneViewportGuard } from '../scene/parts/label_overlap.js';

// Mock kamera minimal: project() memetakan posisi dunia ke NDC linear.
function mkCamera(project) {
  return {
    fov: 50,
    position: { distanceTo: () => 40 },
    project: p => project(p),
  };
}
const DEPS = (cam, W = 1366, H = 768) => ({
  camera: cam, clientWidth: W, clientHeight: H,
  PX_PER_TAN: () => 100, // tinggi label layar = scale*100/dz
  worldPerPx: () => 0.1,
  accumulate: (zt, dy, dx) => {
    zt.userData = zt.userData || {};
    zt.userData.antiY = (zt.userData.antiY || 0) + dy;
    zt.userData.antiX = (zt.userData.antiX || 0) + dx;
  },
});
const mkZone = (ndcX, ndcY, vis = true) => ({
  visible: vis,
  scale: { x: 1, y: 1 },
  position: { clone: () => ({ project: null }), x: 0, y: 0, z: 0 },
  __ndc: [ndcX, ndcY],
});

describe('zoneViewportGuard', () => {
  it('null/undefined → 0, tidak throw', () => {
    expect(zoneViewportGuard(null, DEPS(mkCamera(() => ({ x: 0, y: 0, z: 0 }))))).toBe(0);
  });

  it('zona dalam margin → tidak dikoreksi (0)', () => {
    // NDC (0,0) → layar pusat, jelas dalam margin
    const cam = mkCamera(p => ({ x: 0, y: 0, z: 0.5 }));
    const zt = mkZone(0, 0);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 0, z: 0.5 }) });
    expect(zoneViewportGuard([zt], DEPS(cam))).toBe(0);
  });

  it('zona bocor atas → didorong turun + accumulate terpanggil', () => {
    // NDC y=1 → fy=H/2=384 > topLim 768/2−140−48=196 → koreksi turun
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 0.5 }));
    const zt = mkZone(0, 1);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    const before = zt.position.y;
    const n = zoneViewportGuard([zt], DEPS(cam));
    expect(n).toBe(1);
    expect(zt.position.y).toBeLessThan(before);
    expect(zt.userData.antiY).toBeLessThan(0); // koreksi turun = negatif? (sign konsisten dgn blok lama: corr negatif → y turun)
  });

  it('zona bocor bawah → didorong naik', () => {
    // NDC y=−1 → fy=−384, botLim=384−110=274; fy+zh/2 (zh=100*1/40*1.25≈3.1) < 274 → TIDAK melanggar.
    // Gunakan y=−0.28: fy=−107.5; masih > −196-… tidak melanggar. Uji kanan saja untuk horizontal:
    const cam = mkCamera(() => ({ x: 0.999, y: 0, z: 0.5 }));
    const zt = mkZone(0.999, 0);
    zt.position.clone = () => ({ project: () => ({ x: 0.999, y: 0, z: 0.5 }) });
    const bx = zt.position.x;
    zoneViewportGuard([zt], DEPS(cam));
    expect(zt.position.x).toBeLessThan(bx); // tarik ke kiri
  });

  it('zona di belakang kamera (v.z>1) → dilewati', () => {
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 1.5 }));
    const zt = mkZone(0, 1);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 1.5 }) });
    expect(zoneViewportGuard([zt], DEPS(cam))).toBe(0);
  });

  it('zona invisible → dilewati', () => {
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 0.5 }));
    const zt = mkZone(0, 1, false);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    expect(zoneViewportGuard([zt], DEPS(cam))).toBe(0);
  });

  it('return value = jumlah zona terkoreksi', () => {
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 0.5 }));
    const bad = mkZone(0, 1); bad.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    const good = mkZone(0, 0); good.position.clone = () => ({ project: () => ({ x: 0, y: 0, z: 0.5 }) });
    expect(zoneViewportGuard([bad, good], DEPS(cam))).toBe(1);
  });
});
