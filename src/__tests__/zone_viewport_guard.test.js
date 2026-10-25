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
    const cam = mkCamera(() => ({ x: 0, y: 0, z: 0.5 }));
    const zt = mkZone(0, 0);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 0, z: 0.5 }) });
    expect(zoneViewportGuard([zt], DEPS(cam))).toBe(0);
  });

  it('zona bocor atas (NDC y=+1, y-up) → didorong TURUN + accumulate negatif', () => {
    // NDC y=1 → fy=+H/2=384 > topLim=768/2−140−48=196 → koreksi turun
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 0.5 }));
    const zt = mkZone(0, 1);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    const before = zt.position.y;
    const n = zoneViewportGuard([zt], DEPS(cam));
    expect(n).toBe(1);
    expect(zt.position.y).toBeLessThan(before);
    expect(zt.userData.antiY).toBeLessThan(0); // turun di dunia = koreksi negatif
  });

  it('zona bocor bawah (NDC y=−1, y-up) → didorong NAIK + accumulate positif', () => {
    // fy=−384; fy−zh/2 < −botLim (botLim=384−110=274) → melanggar tepi bawah
    const cam = mkCamera(() => ({ x: 0, y: -1, z: 0.5 }));
    const zt = mkZone(0, -1);
    zt.position.clone = () => ({ project: () => ({ x: 0, y: -1, z: 0.5 }) });
    const before = zt.position.y;
    const n = zoneViewportGuard([zt], DEPS(cam));
    expect(n).toBe(1);
    expect(zt.position.y).toBeGreaterThan(before);
    expect(zt.userData.antiY).toBeGreaterThan(0);
  });

  it('zona bocor kanan → ditarik ke kiri', () => {
    // NDC x=+0.999 → fx=682 > W/2−6=677 − zw/2 → tarik kiri
    const cam = mkCamera(() => ({ x: 0.999, y: 0, z: 0.5 }));
    const zt = mkZone(0.999, 0);
    zt.position.clone = () => ({ project: () => ({ x: 0.999, y: 0, z: 0.5 }) });
    const bx = zt.position.x;
    zoneViewportGuard([zt], DEPS(cam));
    expect(zt.position.x).toBeLessThan(bx);
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

  it('koreksi dibatasi clamp MAX_ZONE_DISP_Y (anti run-away displacement)', () => {
    const cam = mkCamera(() => ({ x: 0, y: 1, z: 0.5 }));
    const zt = mkZone(0, 1);
    zt.position.y = 1.15;
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    const deps = DEPS(cam);
    deps.worldPerPx = () => 100; // nilai wpp sangat besar
    zoneViewportGuard([zt], deps);
    expect(zt.position.y).toBeGreaterThanOrEqual(1.15 - 2.0); // tidak tembus clamp -2.0m
    expect(zt.position.y).toBeLessThan(1.15);
  });

  it('kamera top-down curam menggeser sumbu Z lantai bukan Y dan dibatasi MAX_ZONE_DISP_Z', () => {
    // Kamera di atas ketinggian 50m menghadap lantai Y=0
    const topCam = {
      fov: 50,
      position: { distanceTo: () => 50, y: 50 },
      project: () => ({ x: 0, y: 1, z: 0.5 }),
    };
    const zt = mkZone(0, 1);
    zt.position.y = 1.15;
    zt.position.z = 7.5;
    zt.position.clone = () => ({ project: () => ({ x: 0, y: 1, z: 0.5 }) });
    const deps = DEPS(topCam);
    deps.worldPerPx = () => 100; // wpp sangat besar -> uji clamp
    const n = zoneViewportGuard([zt], deps);
    expect(n).toBe(1);
    expect(zt.position.y).toBe(1.15); // Y tidak ditenggelamkan ke bawah tanah
    expect(zt.position.z).toBeGreaterThanOrEqual(7.5 - 2.0); // clamp -2.0m aman
    expect(zt.position.z).toBeLessThan(7.5); // Z digeser ke arah tengah lantai
  });
});
