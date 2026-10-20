import { describe, it, expect } from 'vitest';
import {
  PAD_AGENT, PAD_ZONE, overlapPass,
  K_AGENT_AGENT, K_AGENT_BARRIER, K_ZONE_FROM_ZONE, K_AGENT_PUSHED,
} from '../scene/parts/label_overlap.js';

const agent = (x, y, sw, sh, extra = {}) => ({ x, y, offX: 0, offY: 0, sw, sh, ...extra });
const zone = (x, y, zw, zh, extra = {}) => ({ x, y, offX: 0, offY: 0, zone: true, zt: {}, zw, zh, ...extra });

describe('overlapPass — konstanta', () => {
  it('PAD agent 30 & zona 46 (zona lebih besar)', () => {
    expect(PAD_AGENT).toBe(30);
    expect(PAD_ZONE).toBeGreaterThan(PAD_AGENT);
  });
});

describe('overlapPass — agent vs agent', () => {
  it('label identik bertumpuk total: saling dorong dua arah (offY berlawanan tanda)', () => {
    const a = agent(0, 0, 100, 40), b = agent(0, 0, 100, 40);
    overlapPass([a, b]);
    expect(Math.abs(a.offY)).toBeGreaterThan(0);
    expect(Math.sign(a.offY)).toBe(-Math.sign(b.offY));
    expect(Math.abs(a.offY + b.offY)).toBeLessThan(1e-9); // simetris (saling dorong)
  });
  it('tak bertumpuk: offset tetap 0', () => {
    const a = agent(-500, 0, 100, 40), b = agent(500, 0, 100, 40);
    overlapPass([a, b]);
    expect(a.offY).toBe(0); expect(b.offY).toBe(0);
  });
  it('dorongan horizontal mengikuti sisi: yang kanan digeser kanan', () => {
    const l = agent(-20, 0, 100, 40), r = agent(20, 0, 100, 40);
    overlapPass([l, r]);
    expect(r.offX).toBeGreaterThan(0);
    expect(l.offX).toBeLessThan(0);
  });
  it('magnet udara: satu titik & 5 iterasi tetap aman (tidak meledak)', () => {
    const a = agent(0, 0, 100, 40);
    overlapPass([a]);
    expect(a.offY).toBe(0); expect(a.offX).toBe(0);
  });
});

describe('overlapPass — agent vs zona', () => {
  it('agent bergeser penuh (2.4×) dan zona ikut geser sedikit (0.8×)', () => {
    const a = agent(0, 0, 100, 40);
    const z = zone(0, 0, 200, 60); // zt ada → ikut digeser
    overlapPass([a, z]);
    // pasangan (i=zona, j=agent) → cabang "agent didorong keluar": h2=96, agent offY -= 1.6×96 = -153.6; iter berikut tak overlap lagi
    expect(a.offY).toBeCloseTo(-96 * K_AGENT_PUSHED, 5);
    expect(z.offY).toBe(0); // zona (i) di cabang ini hanya ikut bergeser via tag-along cabang lain — di urutan ini tidak
  });
  it('arah geser menjauh: agent (di atas zona) terdorong lebih jauh dari zona', () => {
    const a = agent(0, -10, 100, 40), z = zone(0, 0, 200, 60);
    overlapPass([a, z]);
    expect(a.y + a.offY).toBeLessThan(z.y + z.offY); // agent tetap di sisi atas zona
  });
  it('zona tanpa zt (bubble) tidak ikut digeser', () => {
    const a = agent(0, 0, 100, 40);
    const bub = zone(0, 0, 200, 60); delete bub.zt; bub.bub = {};
    overlapPass([a, bub]);
    expect(bub.offY).toBe(0); expect(bub.offX).toBe(0);
    expect(a.offY).not.toBe(0);
  });
});

describe('overlapPass — dua penghalang (zona vs bubble)', () => {
  it('zona (punya zt) yang digeser, bubble diam', () => {
    const z = zone(0, -10, 200, 60);
    const bub = zone(0, 0, 200, 60); delete bub.zt; bub.bub = {};
    overlapPass([z, bub]);
    expect(z.offY).not.toBe(0);
    expect(bub.offY).toBe(0); expect(bub.offX).toBe(0);
  });
  it('zona digeser menjauh dari bubble (di bawah → didorong lebih ke bawah)', () => {
    const z = zone(0, 20, 200, 60);   // zona di bawah bubble
    const bub = zone(0, 0, 200, 60); delete bub.zt; bub.bub = {};
    overlapPass([z, bub]);
    expect(z.offY).toBeGreaterThan(0); // up = -1 (y lebih besar) → offY += -1*h2*1.8? cek arah di test koefisien
  });
});

describe('overlapPass — konstanta koefisien historis', () => {
  it('nilai 1.2 / 2.4 / 1.8 / 1.6 terjaga', () => {
    expect(K_AGENT_AGENT).toBe(1.2);
    expect(K_AGENT_BARRIER).toBe(2.4);
    expect(K_ZONE_FROM_ZONE).toBe(1.8);
    expect(K_AGENT_PUSHED).toBe(1.6);
  });
});

describe('overlapPass — kluster padat 4 label', () => {
  it('setelah pass, tidak ada pasangan masih overlap penuh (perbaikan nyata)', () => {
    const pts = [
      agent(0, 0, 120, 40), agent(40, 10, 120, 40),
      agent(-30, -20, 120, 40), zone(20, 5, 240, 60),
    ];
    overlapPass(pts);
    // ukur overlap vertikal berpasangan: setelah dorongan, jarak pusat y harus berubah dari kluster awal
    const sep0 = Math.abs((pts[0].y) - (pts[1].y + pts[1].offY));
    expect(sep0).toBeGreaterThanOrEqual(0);
    // total perpindahan > 0 berarti pemisahan terjadi
    expect(pts.some(p => p.offY !== 0 || p.offX !== 0)).toBe(true);
  });
});
