// label_occlusion_zone.test.js — Siklus 256: oklusi pasangan AGENT×ZONE.
// Bug produksi (probe steady-state 256, kamera rumah): label zona (X-ray,
// renderOrder 35, sama seperti nameplate) TIDAK PERNAH dioklusi — occlusionPass
// lama memfilter `p.a && !p.zone`. Terukur: RIAN×MEETING frac 0.46,
// INTEGRATOR BOT×WELCOME & LOUNGE frac 0.56, RIZKY×CAFÉ frac 0.21 — SEMUA
// zoneOp=1.00 & agentOp=1.00 (teks-atas-teks pekat). Kontrak baru: zona yang
// mengalah (fade ke OCCL_ZONE_TIE_MIN) saat menumpuk label agen ≥ frac luas
// zona; nama agen SELALU opacity 1.
import { describe, it, expect } from 'vitest';
import { occlusionPass, OCCL_ZONE_TIE_FRAC, OCCL_ZONE_TIE_MIN, OCCL_MIN_OPACITY } from '../scene/parts/label_occlusion.js';

// pt agent ala buildAgentPts; pt zona ala buildZonePts (zt ref, zone:true).
const ag = (name, x, y, sw, sh, dist) => ({ a: { name }, zone: false, x, y, offX: 0, offY: 0, sw, sh, dist });
const zonePt = (label, x, y, zw, zh) => ({
  a: null, zone: true, zt: { id: label }, bub: false,
  zw, zh, baseY: 0, baseX: 0, x, y, offY: 0, offX: 0,
});
// bubble: zone:true TAPI zt null — HARUS dilewati pass (fade oklusi bukan utk bubble)
const bubPt = (x, y, zw, zh) => ({ a: null, zone: true, zt: null, bub: true, zw, zh, baseY: 0, baseX: 0, x, y, offY: 0, offX: 0 });

describe('occlusionPass — pasangan agent×zone (siklus 256)', () => {
  it('konstanta kontrak: ZONE_TIE_FRAC 0.12 < agent tie 0.15, ZONE_TIE_MIN 0.5', () => {
    expect(OCCL_ZONE_TIE_FRAC).toBe(0.12);
    expect(OCCL_ZONE_TIE_FRAC).toBeLessThan(0.15);
    expect(OCCL_ZONE_TIE_MIN).toBe(0.5);
    expect(OCCL_ZONE_TIE_MIN).toBeGreaterThan(OCCL_MIN_OPACITY); // zona lebih terbaca dr oklusi dalam
  });

  it('reproduksi produksi: RIAN menumpuk MEETING 46% → zona pudar, agen opacity 1', () => {
    // Angka dari probe poll#1 siklus 256 (ox=35.3, oy=17.0; zona MEETING ~190×40px)
    const rian = ag('RIAN', 0, 0, 73, 24, 34);
    const meeting = zonePt('MEETING ROOM', 20, 8, 190, 40);
    const pts = [rian, meeting];
    occlusionPass(pts);
    expect(meeting.occ).toBeCloseTo(OCCL_ZONE_TIE_MIN, 10); // zona mengalah
    expect(rian.occ).toBe(1); // agen TIDAK tersentuh
  });

  it('reproduksi produksi: INTEGRATOR BOT×WELCOME & LOUNGE frac 0.56 → zona pudar', () => {
    const bot = ag('INTEGRATOR BOT', 0, 0, 73, 24, 40.8);
    const welcome = zonePt('WELCOME & LOUNGE', 22, 9, 210, 40);
    const pts = [bot, welcome];
    occlusionPass(pts);
    expect(welcome.occ).toBeCloseTo(OCCL_ZONE_TIE_MIN, 10);
    expect(bot.occ).toBe(1);
  });

  it('di bawah frac (sentuhan sudut < 12%) → TIDAK ada yang di-fade', () => {
    // overlap kecil: cukup 1px menyentuh diagonal — jauh di bawah 12% luas zona
    const a = ag('A', 0, 0, 73, 24, 34);
    const z = zonePt('CAFÉ', 120, 60, 160, 40); // ox=116.5, oy=32 → ix=8, iy=8, area 64 < 0.12*6400
    const pts = [a, z];
    const n = occlusionPass(pts);
    expect(n).toBe(0);
    expect(z.occ).toBe(1);
    expect(a.occ).toBe(1);
  });

  it('beberapa agen menumpuk satu zona → fade min (satu nilai), semua agen tetap 1', () => {
    // Kedua agen saling TERPISAH (dx 150 ≥ ox+pad) — keduanya HANYA menumpuk zona.
    const a1 = ag('SARI', 0, 0, 73, 24, 30);
    const a2 = ag('NINA', 150, 0, 73, 24, 31);
    const z = zonePt('DEV DESK', 75, 2, 200, 40);
    const pts = [a1, a2, z];
    occlusionPass(pts);
    expect(z.occ).toBeCloseTo(OCCL_ZONE_TIE_MIN, 10);
    expect(a1.occ).toBe(1);
    expect(a2.occ).toBe(1);
  });

  it('bubble (zone:true, zt:null) DILEWATI saat hanya bersama agen — tidak crash, tidak di-fade', () => {
    const a = ag('BUDI', 0, 0, 73, 24, 30);
    const b = bubPt(0, 4, 120, 60);
    const pts = [a, b];
    expect(() => occlusionPass(pts)).not.toThrow();
    const n = occlusionPass(pts);
    expect(n).toBe(0);
  });

  // ── Siklus 257: tes pasangan BUBBLE×ZONE ──────────────────────────────────
  it('bubble menumpuk zona ≥ 12% → zona pudar ke OCCL_ZONE_TIE_MIN, bubble TIDAK di-fade', () => {
    // Bubble chat aktif di dekat meja DEV DESK
    const b = bubPt(0, 0, 140, 35);
    const z = zonePt('DEV DESK', 10, 5, 180, 40);
    const pts = [b, z];
    const n = occlusionPass(pts);
    expect(n).toBe(1); // 1 zona di-fade
    expect(z.occ).toBeCloseTo(OCCL_ZONE_TIE_MIN, 10);
    expect(b.occ).toBeUndefined(); // bubble tidak di-fade
  });

  it('bubble menyentuh sudut zona secara tipis (< 12%) → TIDAK ada yang di-fade', () => {
    // Overlap kecil di sudut (ix*iy = 10*3 = 30px^2, jauh di bawah 12% bubble 432px^2)
    const b = bubPt(0, 0, 120, 30);
    const zFar = zonePt('SERVER ROOM', 140, 32, 180, 40); // ox=150, oy=35; dx=140, dy=32 -> ix=10, iy=3 -> area 30 < 432
    const pts = [b, zFar];
    const n = occlusionPass(pts);
    expect(n).toBe(0);
    expect(zFar.occ).toBe(1);
  });

  it('bubble DAN agen menumpuk zona yang sama → zona pudar, agen tetap 1, bubble utuh', () => {
    const a = ag('RIAN', -20, 0, 73, 24, 34);
    const b = bubPt(20, 0, 140, 35);
    const z = zonePt('MEETING ROOM', 0, 0, 190, 40);
    const pts = [a, b, z];
    const n = occlusionPass(pts);
    expect(n).toBe(1);
    expect(z.occ).toBeCloseTo(OCCL_ZONE_TIE_MIN, 10);
    expect(a.occ).toBe(1);
    expect(b.occ).toBeUndefined();
  });

  it('bubble jauh dari zona → zona tetap 1.0', () => {
    const b = bubPt(-300, -300, 140, 35);
    const z = zonePt('CAFÉ', 100, 100, 160, 40);
    const pts = [b, z];
    const n = occlusionPass(pts);
    expect(n).toBe(0);
    expect(z.occ).toBe(1);
  });

  it('zona tanpa agen menumpuk → occ 1 (regresi oklusi agent×agent tak berubah)', () => {
    const a = ag('TONI', 0, 0, 73, 24, 30);
    const b = ag('HENDRA', 30, 10, 73, 24, 31); // menumpuk? ox=73, dx=30 <73+26 → cek tie
    const z = zonePt('SERVER ROOM', 500, 500, 200, 40); // jauh, tidak menumpuk siapa pun
    const pts = [a, b, z];
    occlusionPass(pts);
    expect(z.occ).toBe(1);
  });
});
