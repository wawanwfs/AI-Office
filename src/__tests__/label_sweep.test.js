import { describe, it, expect } from 'vitest';
import {
  sweepVertical, clampViewport, sweepClampRounds,
  SWEEP_GAP, VIEW_TOP_MARGIN, VIEW_BOT_MARGIN, ZONE_TOP_EXTRA,
  PAD_X_ZONE, PAD_X_AGENT, MAX_ROUNDS,
} from '../scene/parts/label_overlap.js';

// Viewport uji: 1200×800 -> H2=400, W2=600, TOP=260, BOT=290
// Label aman di tengah: x=300 (fx+wHalf=350 < 598), y=100 (fy+half=125 < 290, fy-half=75 > -260)
const AG = (x = 300, y = 100, offY = 0, offX = 0) => ({ a: 1, zone: false, x, y, offX, offY, sw: 100, sh: 50 });
const ZN = (x = 300, y = 100, offY = 0, offX = 0) => ({ zone: true, x, y, offX, offY, zw: 150, zh: 60 });
const OPTS = { height: 800, width: 1200 };

describe('konstanta historis sweep+clamp', () => {
  it('mempertahankan nilai historis', () => {
    expect(SWEEP_GAP).toBe(36);
    expect(VIEW_TOP_MARGIN).toBe(140);
    expect(VIEW_BOT_MARGIN).toBe(110);
    expect(ZONE_TOP_EXTRA).toBe(130); // 48→130 siklus 47: ruang tarik-balik anti-overlap (terukur e2e_zone_multi)
    expect(PAD_X_ZONE).toBe(6);
    expect(PAD_X_AGENT).toBe(2);
    expect(MAX_ROUNDS).toBe(3);
  });
});

describe('sweepVertical', () => {
  it('mendorong label bawah ke bawah dari label atas yang overlap', () => {
    const pts = [AG(300, 200), AG(300, 205)];
    sweepVertical(pts);
    // byY: y=200 lalu y=205; need = 200+25+25+36 = 286 -> offY kedua = 286-205
    const low = pts.find(p => p.y === 205);
    expect(low.offY).toBeCloseTo(286 - 205);
    const top = pts.find(p => p.y === 200);
    expect(top.offY).toBe(0);
  });

  it('tidak menggeser label yang sudah terpisah', () => {
    const pts = [AG(300, 100), AG(300, 200)];
    sweepVertical(pts);
    expect(pts.every(p => p.offY === 0)).toBe(true);
  });

  it('mengabaikan label yang terpisah horizontal (|dx| >= (w1+w2)/2 + gap)', () => {
    const pts = [AG(100, 100), AG(400, 110)]; // dx=300 >= 100+36
    sweepVertical(pts);
    expect(pts.every(p => p.offY === 0)).toBe(true);
  });

  it('mempertahankan offY yang sudah ada: posisi efektif = y+offY (label tergeser jadi acuan)', () => {
    const pts = [AG(300, 100, 40), AG(300, 100)]; // sama y, pertama sudah digeser +40
    sweepVertical(pts);
    // byY urut y+offY: pts[1] (100) di atas, pts[0] (140) di bawah;
    // need utk pts[0] = 100+25+25+36 = 186 -> offY = 186-100 = 86; pts[1] tetap 0
    expect(pts[0].offY).toBeCloseTo(86);
    expect(pts[1].offY).toBe(0);
  });

  it('tidak menurunkan label (hanya mendorong ke bawah bila overlap)', () => {
    const pts = [AG(300, 300), AG(300, 100)];
    sweepVertical(pts);
    expect(pts[0].offY).toBe(0);
    expect(pts[1].offY).toBe(0);
  });

  it('menghormati gap kustom', () => {
    const pts = [AG(300, 100), AG(300, 100)];
    sweepVertical(pts, 100);
    expect(pts[1].offY).toBeCloseTo(100 + 25 + 25 + 100 - 100);
  });
});

describe('clampViewport', () => {
  it('mengembalikan false bila semua label dalam viewport', () => {
    const pts = [AG(300, 100), ZN(300, -100)];
    expect(clampViewport(pts, OPTS)).toBe(false);
    expect(pts.every(p => p.offY === 0 && p.offX === 0)).toBe(true);
  });

  it('menurunkan label yang masuk lane header (atas) ke bawah', () => {
    // TOP = 400 - 140 = 260; half=25 -> fy=300 melanggar (300+25=325>260)
    const pts = [AG(300, 300)];
    expect(clampViewport(pts, OPTS)).toBe(true);
    expect(pts[0].y + pts[0].offY + 25).toBeCloseTo(260);
  });

  it('mendorong label yang bocor ke toolbar (bawah) ke atas', () => {
    // BOT = 400 - 110 = 290; fy - 25 < -290 -> fy = -300 melanggar (-325 < -290)
    const pts = [AG(300, -300)];
    expect(clampViewport(pts, OPTS)).toBe(true);
    expect(pts[0].y + pts[0].offY - 25).toBeCloseTo(-290);
  });

  it('zona punya margin atas ekstra ZONE_TOP_EXTRA (agent lebih longgar)', () => {
    // TOP agent = 260; TOP zona = 260 - 130 = 130.
    // y=200: agent (200+25=225 <= 260) tidak melanggar.
    // Zona (200+30=230 > 130) melanggar -> tepi atas ditarik ke 130.
    const z = ZN(300, 200); const a = AG(300, 200);
    expect(clampViewport([z, a], OPTS)).toBe(true);
    expect(z.y + z.offY + 30).toBeCloseTo(130);
    expect(a.y + a.offY + 25).toBeCloseTo(225); // agent tidak digeser
  });

  it('clamp horizontal kanan dengan pad zona 6 vs agent 2', () => {
    // W2=600; zona zw=150: 300+75=375 tak melanggar -> pakai x=560: 560+75=635>594
    const z = ZN(560, 100); const a = AG(560, 100); // agent: 560+50=610>598
    expect(clampViewport([z, a], OPTS)).toBe(true);
    expect(z.x + z.offX + 75).toBeCloseTo(594);
    expect(a.x + a.offX + 50).toBeCloseTo(598);
  });

  it('clamp horizontal kiri', () => {
    const _pts = [AG(30, 100)];
    const z = ZN(-520, 100);
    expect(clampViewport([z], OPTS)).toBe(true);
    expect(z.x + z.offX - 75).toBeCloseTo(-594);
  });

  it('mengembalikan false pada frame kedua setelah koreksi (stabil)', () => {
    const pts = [AG(300, 300)];
    clampViewport(pts, OPTS);
    expect(clampViewport(pts, OPTS)).toBe(false);
  });
});

describe('sweepClampRounds (siklus penuh)', () => {
  it('kluster menumpuk dekat atas: sweep lalu clamp menarik ke dalam header', () => {
    const pts = [AG(300, 270), AG(300, 275), AG(300, 280)];
    sweepClampRounds(pts, OPTS);
    pts.forEach(p => {
      expect(p.y + p.offY + 25).toBeLessThanOrEqual(260 + 1e-9);
      expect(p.y + p.offY - 25).toBeGreaterThanOrEqual(-290 - 1e-9);
    });
  });

  it('kluster padat tetap terpisah vertikal setelah siklus (aman dari clamp)', () => {
    const pts = [AG(300, 50), AG(300, 50), AG(300, 50)];
    sweepClampRounds(pts, OPTS);
    const ys = pts.map(p => p.y + p.offY).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(50 + 36 - 1e-6); // half+half+gap
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(50 + 36 - 1e-6);
    // masih dalam viewport
    expect(ys[2]).toBeLessThanOrEqual(265 + 1e-9);
  });

  it('label aman tidak diubah sama sekali', () => {
    const pts = [AG(300, 100)];
    sweepClampRounds(pts, OPTS);
    expect(pts[0].offX).toBe(0);
    expect(pts[0].offY).toBe(0);
  });

  it('menghormati rounds kustom: 1 round tetap menghasilkan posisi dalam viewport', () => {
    const pts = [AG(300, 280), AG(300, 285)];
    sweepClampRounds(pts, OPTS, 1);
    pts.forEach(p => expect(p.y + p.offY + 25).toBeLessThanOrEqual(290 + 1e-9));
  });
});
