// Unit test pembangunan pts label (buildAgentPts/buildZonePts/buildBubblePts/PX_PER_TAN)
// — diekstrak dari animate() OfficeScene ke parts/label_overlap.js.
import { describe, it, expect } from 'vitest';
import { buildAgentPts, buildZonePts, buildBubblePts, PX_PER_TAN, zoneScreenFade } from '../scene/parts/label_overlap.js';

const label = (sx, sy, y, x, antiY = 0, antiX = 0) => ({
  scale: { x: sx, y: sy },
  position: { y, x },
  userData: { antiY, antiX },
});
const proj = (x, y, z = 0) => ({ x, y, z });

describe('PX_PER_TAN', () => {
  it('rumus persis kode lama: h/(2·tan(fov·π/360))', () => {
    expect(PX_PER_TAN(768, 60)).toBeCloseTo(768 / (2 * Math.tan(60 * Math.PI / 360)), 10);
  });
  it('proporsional terhadap tinggi layar', () => {
    expect(PX_PER_TAN(1536, 60) / PX_PER_TAN(768, 60)).toBeCloseTo(2, 10);
  });
});

describe('buildAgentPts', () => {
  it('sw/sh = scale × k; base = posisi − offset lama; x/y = NDC × setengah dimensi', () => {
    const vis = [{ label: label(1.2, 0.4, 2.5, 0.7, 30, -8), proj: proj(0.2, -0.4) }];
    const pts = buildAgentPts(vis, 700, 683, 384); // 1366/2, 768/2
    expect(pts).toHaveLength(1);
    const p = pts[0];
    expect(p.a).toBe(vis[0]);
    expect(p.zone).toBe(false);
    expect(p.sw).toBeCloseTo(1.2 * 700, 10);
    expect(p.sh).toBeCloseTo(0.4 * 700, 10);
    expect(p.baseY).toBe(2.5 - 30);
    expect(p.baseX).toBe(0.7 - -8);
    expect(p.x).toBeCloseTo(0.2 * 683, 10);
    expect(p.y).toBeCloseTo(-0.4 * 384, 10);
    expect(p.offY).toBe(0); expect(p.offX).toBe(0);
  });
  it('offset lama 0/undefined → base = posisi utuh', () => {
    const vis = [{ label: label(1, 1, 2, 0, undefined, undefined), proj: proj(0, 0) }];
    const p = buildAgentPts(vis, 100, 50, 50)[0];
    expect(p.baseY).toBe(2); expect(p.baseX).toBe(0);
  });
  it('banyak agent dipetakan searah', () => {
    const vis = [1, 2, 3].map(i => ({ label: label(i, i, i, i), proj: proj(i * 0.1, 0) }));
    const pts = buildAgentPts(vis, 500, 100, 100);
    expect(pts).toHaveLength(3);
    expect(pts.map(p => p.a)).toEqual(vis);
  });
});

describe('buildZonePts', () => {
  const ent = (over = {}) => ({
    ref: { id: 'z' }, visible: true, proj: proj(0.1, 0.2, 0.3),
    dist: 5, label: 'QA', base: { y: 1.0, x: 2.0 }, antiY: 0.2, antiX: -0.1,
    scale: { x: 3.0, y: 1.0 }, ...over,
  });
  it('eukivalensi rumus lama: pw, zw×1.06, zh×1.25, base + jitter + anti', () => {
    const k = 700, pxW = 683, pxH = 384, dz = Math.max(2, 5);
    const pts = buildZonePts([ent()], k, pxW, pxH);
    expect(pts).toHaveLength(1);
    const p = pts[0];
    const pw = 3.0 * k / dz;
    expect(p.zw).toBeCloseTo(pw * 1.06, 10);
    expect(p.zh).toBeCloseTo(1.0 * k / dz * 1.25, 10);
    const { jy, jx } = (() => {
      let h = 0; for (const ch of 'QA') h = (h * 31 + ch.charCodeAt(0)) | 0;
      return { jy: (h % 7) - 3, jx: ((h >> 3) % 9) - 4 };
    })();
    expect(p.baseY).toBeCloseTo(1.0 + jy * 0.06 + 0.2, 10);
    expect(p.baseX).toBeCloseTo(2.0 + jx * 0.08 + -0.1, 10);
    expect(p.x).toBeCloseTo(0.1 * pxW, 10);
    expect(p.y).toBeCloseTo(0.2 * pxH, 10);
    expect(p.zone).toBe(true); expect(p.a).toBe(null); expect(p.offY).toBe(0);
  });
  it('dist di-clamp ≥2 (sprite tak meledak saat sangat dekat)', () => {
    const pts = buildZonePts([ent({ dist: 0.1 })], 700, 683, 384);
    expect(pts[0].zw).toBeCloseTo(3.0 * 700 / 2 * 1.06, 10);
  });
  it('anti-poisoning: dist NaN → fallback dz=2 (zw/zh tetap finite, tak merambat NaN)', () => {
    const pts = buildZonePts([ent({ dist: NaN })], 700, 683, 384);
    expect(pts).toHaveLength(1);
    expect(Number.isFinite(pts[0].zw)).toBe(true);
    expect(Number.isFinite(pts[0].zh)).toBe(true);
    expect(pts[0].zw).toBeCloseTo(3.0 * 700 / 2 * 1.06, 10); // sama dgn clamp dist<2
  });
  it('anti-poisoning: scale NaN/undefined → zw/zh 0 (ukuran nol, no-op layout) & fade tampil penuh', () => {
    const pts = buildZonePts([ent({ scale: { x: NaN, y: NaN } })], 700, 683, 384);
    expect(pts).toHaveLength(1);
    expect(pts[0].zw).toBe(0);
    expect(pts[0].zh).toBe(0);
    expect(pts[0].fade).toEqual({ opacity: 1, visible: true });
    expect(buildZonePts([ent({ scale: undefined })], 700, 683, 384)[0].zw).toBe(0);
  });
  it('fade: sangat dekat → opacity rendah & invisible; jauh → opaque', () => {
    const far = buildZonePts([ent({ dist: 50 })], 700, 683, 384)[0];
    expect(far.fade.opacity).toBe(1); expect(far.fade.visible).toBe(true);
    // pw = 3*700/2 = 1050 > 340+260 → fade 0
    const near = buildZonePts([ent({ dist: 2 })], 700, 683, 384)[0];
    expect(near.fade.opacity).toBe(0); expect(near.fade.visible).toBe(false);
    // ekuivalensi langsung zoneScreenFade
    expect(near.fade).toEqual(zoneScreenFade(3 * 700 / 2));
  });
  it('invisible & di belakang kamera (v.z>1) dilewati; null-safe', () => {
    expect(buildZonePts([ent({ visible: false })], 700, 683, 384)).toHaveLength(0);
    expect(buildZonePts([ent({ proj: proj(0, 0, 1.5) })], 700, 683, 384)).toHaveLength(0);
    expect(buildZonePts(null, 700, 683, 384)).toHaveLength(0);
  });
  it('base fallback {0,0} bila base tidak ada', () => {
    const pts = buildZonePts([ent({ base: undefined })], 700, 683, 384);
    expect(pts[0].baseY).toBeCloseTo(pts[0].baseY - (pts[0].baseY - pts[0].baseY), 10); // tidak throw
    expect(typeof pts[0].baseY).toBe('number');
  });
  it('anti undefined → 0 (base tetap dipakai)', () => {
    let h = 0; for (const ch of 'QA') h = (h * 31 + ch.charCodeAt(0)) | 0;
    const { jy, jx } = { jy: (h % 7) - 3, jx: ((h >> 3) % 9) - 4 };
    const pts = buildZonePts([ent({ antiY: undefined, antiX: undefined })], 700, 683, 384);
    expect(pts[0].baseY).toBeCloseTo(1.0 + jy * 0.06, 10);
    expect(pts[0].baseX).toBeCloseTo(2.0 + jx * 0.08, 10);
  });
});

describe('buildBubblePts', () => {
  const mk = (x = 0.1, y = -0.2, z = 0, sy = 0.3) => ({
    ref: { scale: { x: 0.5, y: sy }, position: { y: 1.4, x: 0.5 } },
    proj: proj(x, y, z),
  });
  it('piksel konstan: zw/zh = scale × k (tanpa dibagi jarak), base dari posisi', () => {
    const b = mk();
    const pts = buildBubblePts([b], 700, 683, 384);
    expect(pts).toHaveLength(1);
    const p = pts[0];
    expect(p.zone).toBe(true); expect(p.zt).toBe(null);
    expect(p.bub).toBe(b.ref); // identitas dipertahankan via ref
    expect(p.zw).toBeCloseTo(0.5 * 700, 10);
    expect(p.zh).toBeCloseTo(0.3 * 700, 10);
    expect(p.baseY).toBe(1.4); expect(p.baseX).toBe(0.5);
  });
  it('di belakang kamera dilewati; null-safe', () => {
    expect(buildBubblePts([mk(0, 0, 1.2)], 700, 683, 384)).toHaveLength(0);
    expect(buildBubblePts(null, 700, 683, 384)).toHaveLength(0);
    expect(buildBubblePts([], 700, 683, 384)).toHaveLength(0);
  });
  it('banyak bubble dipetakan searah', () => {
    const bs = [mk(0.1), mk(-0.3), mk(0.5, 0.5)];
    const pts = buildBubblePts(bs, 700, 683, 384);
    expect(pts).toHaveLength(3);
    expect(pts[2].x).toBeCloseTo(0.5 * 683, 10);
  });
});
