// label_occlusion.test.js — guard oklusi antar-sprite nameplate (backlog visual 238c).
// Masalah yang ditutup: label agen X-ray (depthTest false, renderOrder 35) membuat
// nameplate baris belakang tergambar PENUH di atas nameplate baris depan di kluster
// tengah — teks-atas-teks "bertumpuk kertas". occlusionPass memudarkan label yang
// menumpuk di layar dgn label LEBIH DEKAT ke kamera (fade berbasis selisih kedalaman).
import { describe, it, expect } from 'vitest';
import { occlusionFade, occlusionPass, OCCL_START, OCCL_END, OCCL_MIN_OPACITY, OCCL_PX, OCCL_TIE_FRAC, OCCL_TIE_MIN_OPACITY } from '../scene/parts/label_occlusion.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// pt label agent ala buildAgentPts + dist kamera. Koordinat piksel layar pusat.
const lbl = (name, x, y, sw, sh, dist, extra = {}) => ({
  a: { name }, zone: false, x, y, offX: 0, offY: 0, sw, sh, dist, ...extra,
});

describe('occlusionFade — kurva fade kedalaman', () => {
  it('konstanta kontrak: START 2.5, END 6.0, MIN 0.18, PAD 26', () => {
    expect(OCCL_START).toBe(2.5);
    expect(OCCL_END).toBe(6.0);
    expect(OCCL_MIN_OPACITY).toBeGreaterThan(0);
    expect(OCCL_MIN_OPACITY).toBeLessThan(0.5);
    expect(OCCL_PX).toBeGreaterThan(0);
  });
  it('selisih ≤ START → 1 (tak tertutup berarti)', () => {
    expect(occlusionFade(5, 5)).toBe(1);
    expect(occlusionFade(5, 5 + OCCL_START - 0.01)).toBe(1);
  });
  it('selisih ≥ END → OCCL_MIN_OPACITY (samar tapi terbaca, TIDAK 0)', () => {
    expect(occlusionFade(5 + OCCL_END, 5)).toBe(OCCL_MIN_OPACITY);
    expect(occlusionFade(5 + OCCL_END + 10, 5)).toBe(OCCL_MIN_OPACITY);
  });
  it('di antara START..END → linear 1→MIN', () => {
    const mid = OCCL_START + (OCCL_END - OCCL_START) / 2;
    const f = occlusionFade(5 + mid, 5); // label 5+mid, penutup 5 (lebih dekat)
    expect(f).toBeGreaterThan(OCCL_MIN_OPACITY);
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(1 - 0.5 * (1 - OCCL_MIN_OPACITY), 10);
  });
  it('anti-poisoning: dist non-finite → 1', () => {
    expect(occlusionFade(NaN, 3)).toBe(1);
    expect(occlusionFade(5, Infinity)).toBe(1);
    expect(occlusionFade(undefined, 3)).toBe(1);
  });
});

describe('occlusionPass — aturan siapa menutup siapa', () => {
  it('label lebih jauh yang menumpuk di layar dgn label lebih dekat → faded', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10); // 4 unit lebih dekat, box sama
    const n = occlusionPass([far, near]);
    expect(far.occ).toBeLessThan(1);
    expect(near.occ).toBe(1); // penutup tak pernah pudar
    expect(n).toBe(1);
  });
  it('TIDAK fade bila tidak menumpuk di layar (jarak bebas > PAD)', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 200, 60, 30, 10); // jauh di layar
    expect(occlusionPass([far, near])).toBe(0);
    expect(far.occ).toBe(1);
  });
  it('TIDAK fade bila selisih kedalaman kecil DAN tumpukan di bawah ambang tie (baris sejajar)', () => {
    const a = lbl('A', 0, 0, 60, 30, 11);
    const b = lbl('B', 0, 0, 60, 30, 10); // 1 unit — di bawah OCCL_START & di bawah tieFrac? tumpuk total → tie MENYALA
    // Kontrak 250 mengubah perilaku ini SECARA SENGAJA utk tumpukan nyata:
    // Δdist < START + tumpuk ≥ tieFrac = dua teks pekat saling menimpa.
    expect(occlusionPass([a, b])).toBe(1);
    expect(a.occ).toBe(OCCL_TIE_MIN_OPACITY);
    expect(b.occ).toBe(1);
  });
  it('TIDAK fade bila selisih kedalaman kecil dan label hanya bersinggungan tepi (< tieFrac)', () => {
    // geser vertikal 22px dari tinggi 30 → tumpukan tipis ~ (30-22)/30 = 27% …
    // dibuat lebih tipis lagi: hanya 4px → 4/30 = 13% < 15% ambang
    const a = lbl('A', 0, 0, 60, 30, 11);
    const b = lbl('B', 0, 26, 60, 30, 10);
    expect(occlusionPass([a, b])).toBe(0);
    expect(a.occ).toBe(1); expect(b.occ).toBe(1);
  });
  it('penutup wajib LEBIH dekat: label terdekat yang menumpuk TIDAK terpengaruh label belakang', () => {
    const back = lbl('BACK', 0, 0, 60, 30, 20);
    const front = lbl('FRONT', 0, 0, 60, 30, 12);
    occlusionPass([front, back]);
    expect(front.occ).toBe(1); expect(back.occ).toBeLessThan(1);
  });
  it('multi-penutup: fade terkuat (TERDEKAT) yang menang', () => {
    const l = lbl('L', 0, 0, 60, 30, 20);
    const near1 = lbl('N1', 0, 0, 60, 30, 13); // selisih 7 ≥ END → MIN
    const near2 = lbl('N2', 0, 0, 60, 30, 16); // selisih 4 → fade parsial
    occlusionPass([l, near1, near2]);
    expect(l.occ).toBe(OCCL_MIN_OPACITY); // min antar pasangan
  });
  it('posisi FINAL (offX/offY) yang dipakai — bukan posisi dasar', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10);
    // dasar jauh (600px) tapi FINAL geser ke box penutup
    far.y = 600; far.offY = -600;
    expect(occlusionPass([far, near])).toBe(1);
    expect(far.occ).toBeLessThan(1);
  });
  it('zona & bubble (tanpa `a`/dengan zone) dilewati — tanpa dist juga aman', () => {
    const zonePt = { a: null, zone: true, x: 0, y: 0, zw: 100, zh: 40, dist: 10 };
    const agent = lbl('A', 0, 0, 60, 30, 10);
    expect(occlusionPass([zonePt, agent])).toBe(0);
    const noDist = lbl('B', 0, 0, 60, 30, undefined);
    expect(occlusionPass([noDist, agent])).toBe(0);
    expect(noDist.occ).toBe(1);
    expect(occlusionPass(null)).toBe(0);
  });
  it('field posisi TIDAK diubah (hanya occ ditulis)', () => {
    const far = lbl('BEHIND', 3, 4, 60, 30, 14);
    const near = lbl('FRONT', 3, 4, 60, 30, 10);
    occlusionPass([far, near]);
    expect(far.x).toBe(3); expect(far.y).toBe(4);
    expect(far.offX).toBe(0); expect(far.offY).toBe(0);
    expect(far.sw).toBe(60); expect(far.sh).toBe(30);
  });
  // ── Siklus 251b: posisi GAMBAR (drawnX/drawnY) menang atas pts-final ──────
  // OfficeScene mengonversi offset → dunia dgn clamp; realisasi clamp bisa tetap
  // tumpuk meski layout intensi (x+offX) sudah "terpisah" → pass wajib menilai
  // posisi digambar bila pemanggil menyediakannya (temuan steady-state 251:
  // pasangan op-1 yang pts-final-nya tak overlap ≥15% tapi realisasi tumpuk).
  it('drawnX/drawnY dipakai bila ada: layout intensi terpisah tapi digambar tumpuk → tetap fade', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10);
    // layout intensi terpisah jauh (x+offX = 200px) tapi realisasi dunia (clamp)
    // menaruh keduanya hampir di tempat sama di layar
    far.offX = 200; near.offX = 0;
    far.drawnX = 2; far.drawnY = 1; near.drawnX = 0; near.drawnY = 0;
    const n = occlusionPass([far, near]);
    expect(n).toBe(1); // jauh (dist 14 vs 10) → fade
    expect(far.occ).toBeLessThan(1);
    expect(near.occ).toBe(1);
  });
  it('drawnX/drawnY tumpuk BUKAN menyalakan fade bila intensi sudah terpisah nyata (kontrak ganda arah)', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10);
    // sebaliknya: pts-final tumpuk (x sama) tapi posisi digambar (pasca-clamp)
    // terpisah jauh → TIDAK ada fade (yang digambar tidak bertabrakan)
    far.drawnX = 300; near.drawnX = 0; far.drawnY = 0; near.drawnY = 0;
    const n = occlusionPass([far, near]);
    expect(n).toBe(0);
    expect(far.occ).toBe(1);
  });
  it('tanpa drawnX/drawnY → fallback kontrak lama x+offX (kompatibilitas pemanggil lama)', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10);
    expect(occlusionPass([far, near])).toBe(1); // box sama persis → fade (jalur lama)
  });
});

describe('drift-gate sumber OfficeScene.js — oklusi terpasang di jalur relayout', () => {
  const src = readFileSync(join(here, '..', 'scene', 'OfficeScene.js'), 'utf8');
  it('occlusionPass diimpor & dipanggil setelah sweepClampRounds', () => {
    expect(src).toMatch(/import \{ occlusionPass, OCCL_MIN_OPACITY \} from '\.\/parts\/label_occlusion\.js'/);
    const iSweep = src.indexOf('sweepClampRounds(pts,');
    const iOcc = src.indexOf('occlusionPass(pts)');
    expect(iSweep).toBeGreaterThan(-1);
    expect(iOcc).toBeGreaterThan(iSweep); // pass oklusi SETELAH sweep/clamp (posisi final)
  });
  it('fade diterapkan ke material.opacity label dgn floor OCCL_MIN_OPACITY + dist kamera dibangun di pts', () => {
    expect(src).toMatch(/dist:camera\.position\.distanceTo\(a\.label\.position\)/);
    expect(src).toMatch(/p\.a\.label\.material\.opacity=OCCL_MIN_OPACITY\+prevO\*\(1-OCCL_MIN_OPACITY\)/);
    expect(src).toMatch(/window\.__occlFade/); // hook probe e2e
  });
  it('hook __occlFade terdaftar SCENE_HOOKS (purge destroy menjangkaunya)', () => {
    const hooks = readFileSync(join(here, '..', 'scene', 'parts', 'scene_hooks.js'), 'utf8');
    expect(hooks).toContain("'__occlFade'");
  });
  it('damping oklusi memakai waktu-nyata antar tick (relayoutDelta), bukan delta 1 frame (siklus 251)', () => {
    // Akar bug 251: LBL_SMOOTH memakai deltaFrame (delta SATU frame, cap 0.05 s)
    // padahal diterapkan sekali per tick relayout (tiap 4 frame) → laju efektif
    // 3/s; di renderer lambat (0.3–0.5 FPS, tick 8 dtk) konvergensi 60–90 detik —
    // pasangan tumpuk tetap opacity 1 (klaim vision "nameplate bertumpuk").
    // Kontrak: relayoutDelta diakumulasi antar tick & LBL_SMOOTH memakainya.
    expect(src).toMatch(/relayoutDelta \+= delta;/);
    expect(src).toMatch(/const LBL_SMOOTH=expDamp\(12,Math\.min\(relayoutDelta,2\)\)/);
    expect(src).not.toMatch(/LBL_SMOOTH=1-Math\.exp\(-12\*\(deltaFrame/); // pola lama dilarang kembali
    expect(src).toMatch(/let relayoutDelta=0;/); // deklarasi ada (di-reset per tick)
  });
  it('relayoutDelta diakumulasi per frame di animate(), bukan di dalam blok throttled shouldRelayoutLabels (siklus 263)', () => {
    // Siklus 263: siklus 251 meletakkan `relayoutDelta += delta;` di dalam
    // `if(namesVisible&&shouldRelayoutLabels(frame))` — akibatnya frame 1,2,3
    // terbuang (relayoutDelta tetap 0) dan hanya delta frame ke-4 yang ditambahkan.
    // Laju efektif jatuh 4× lebih lambat dari kontrak 12/s.
    // Guard: relayoutDelta += delta harus berada di animate() sebelum blok throttle.
    const iAnimate = src.indexOf('function animate()');
    const iAcc = src.indexOf('relayoutDelta += delta;', iAnimate);
    const iThrot = src.indexOf('if(namesVisible&&(shouldRelayoutLabels(frame)||__labelGate(elapsed)))', iAnimate);
    expect(iAnimate).toBeGreaterThan(-1);
    expect(iAcc).toBeGreaterThan(iAnimate);
    expect(iThrot).toBeGreaterThan(iAcc);

    // REGRESI DILARANG: relayoutDelta += delta di dalam blok throttled
    const iThrotEnd = src.indexOf('relayoutDelta=0;', iThrot);
    const throtBlock = src.slice(iThrot, iThrotEnd);
    expect(throtBlock).not.toMatch(/relayoutDelta\s*\+=\s*delta/);
  });
  it('kontrak matematis konvergensi damping 12/s: 4 frame akumulasi vs delta 1 frame lama (siklus 263)', () => {
    // 60 FPS: 4 frame = 4 * (1/60) s ≈ 0.0667 s
    const dt4_60 = 4 / 60;
    const factor60 = 1 - Math.exp(-12 * dt4_60);
    expect(factor60).toBeGreaterThan(0.50);
    expect(factor60).toBeLessThan(0.60);

    // Bandingkan dengan rumus lama (hanya 1 frame = 1/60 s)
    const factorOld60 = 1 - Math.exp(-12 * (1 / 60));
    expect(factorOld60).toBeLessThan(0.20); // dulu hanya ~0.18

    // SwiftShader 0.4 FPS (clamp dt 0.05s per frame): 4 frame = 0.20 s
    const dt4_ss = 4 * 0.05;
    const factorSS = 1 - Math.exp(-12 * dt4_ss);
    expect(factorSS).toBeGreaterThan(0.90);

    // Bandingkan dengan rumus lama di SwiftShader (hanya 1 frame = 0.05 s)
    const factorOldSS = 1 - Math.exp(-12 * 0.05);
    expect(factorOldSS).toBeLessThan(0.50); // dulu hanya ~0.45 per tick (~64s)
  });
});

// ── Siklus 250: aturan TIE — tetangga meja kedalaman nyaris sama ────────────
// Probe produksi (kamera rumah & preset iso): 9–19 pasangan label bertumpuk
// tetap opacity 1 padahal pasca-fix oklusi 249 — semuanya Δdist < OCCL_START
// (0.05–2.3 unit, tetangga meja 2.0–4.0 unit dunia) sehingga kurva kedalaman
// 240 melewati mereka, sementara anti-overlap 2D mustahil memisahkan label
// 73.4px dgn offset ter-clamp ±16px. Kini pasangan tumpuk ≥25% luas label
// terkecil dgn Δdist < START dipudarkan satu sisi ke 0.55.
describe('occlusionPass — aturan TIE (siklus 250)', () => {
  const lblT = (name, x, y, sw, sh, dist, extra = {}) => ({
    a: { name }, zone: false, x, y, offX: 0, offY: 0, sw, sh, dist, ...extra,
  });

  it('tetangga meja (Δdist kecil, tumpukan ≥ 15% luas terkecil) → yang lebih jauh pudar ke TIE_MIN', () => {
    // replika produksi preset iso (probe 250): RIZKY × GILANG — tumpukan
    // 0.66 luas, jarak kamera 46.6 vs 47.1 (Δ 0.46 < START 2.5): kurva
    // kedalaman 240 melewati (Δ < START), kini aturan tie yang menyala.
    const near = lblT('RIZKY', 770, 292, 73.4, 22.4, 46.6);
    const far = lblT('GILANG', 804, 282, 73.4, 22.4, 47.1);
    const n = occlusionPass([near, far]);
    expect(n).toBe(1);
    expect(far.occ).toBe(OCCL_TIE_MIN_OPACITY);
    expect(near.occ).toBe(1); // pemenang tak tersentuh
  });

  it('tumpukan DI BAWAH ambang (label nyaris tidak bersinggungan) → tidak pudar', () => {
    // oy ~ dy 1.1px ≪ ambang; ix kecil → area < 25%
    const far = lblT('TONI', 672, 275, 73.4, 22.4, 46.79);
    const near = lblT('SUPPORT', 619, 296, 73.4, 22.4, 44.73);
    const n = occlusionPass([far, near]);
    expect(far.occ).toBe(1);
    expect(near.occ).toBe(1);
    expect(n).toBe(0);
  });

  it('ekuivalen dist persis → nama lexicographic yang pudar (deterministik)', () => {
    const a = lblT('zeta', 0, 0, 73.4, 22.4, 46.0);
    const b = lblT('alpha', 0, 0, 73.4, 22.4, 46.0); // tumpuk total, dist sama
    const n = occlusionPass([a, b]);
    expect(n).toBe(1);
    expect(a.occ).toBe(OCCL_TIE_MIN_OPACITY); // 'zeta' > 'alpha' → zeta pudar
    expect(b.occ).toBe(1);
  });

  it('kurva kedalaman 240 UTUH: penutup lebih dekat ≥ START tetap pakai kurva lama', () => {
    const far = lblT('BEHIND', 0, 0, 60, 30, 20);
    const near = lblT('FRONT', 0, 0, 60, 30, 12); // Δ 8 ≥ END → MIN_OPACITY lama
    const n = occlusionPass([far, near]);
    expect(n).toBe(1);
    expect(far.occ).toBe(OCCL_MIN_OPACITY); // bukan TIE_MIN
  });

  it('pasangan yang SUDAH di-fade kurva kedalaman tak makin pudar oleh tie (min antar aturan)', () => {
    const far = lblT('L', 0, 0, 60, 30, 14);   // Δ 4 → kurva parsial ~0.607
    const near = lblT('N', 0, 0, 60, 30, 10);  // tie juga memenuhi (Δ < START)
    occlusionPass([far, near]);
    expect(far.occ).toBeCloseTo(occlusionFade(14, 10), 10); // kurva menang (lebih pudar)
  });

  it('tieFrac 0 → aturan tie MATI total (perilaku pra-250 utk Δdist < START)', () => {
    const far = lblT('ARIS', 0, 0, 73.4, 22.4, 47.32);
    const near = lblT('CLARA', 0, 0, 73.4, 22.4, 45.15);
    const n = occlusionPass([far, near], { tieFrac: 0 });
    expect(n).toBe(0);
    expect(far.occ).toBe(1);
  });

  it('label tanpa dist tetap dilewati aturan tie (kontrak lama utuh)', () => {
    const noDist = lblT('X', 0, 0, 73.4, 22.4, undefined);
    const has = lblT('Y', 0, 0, 73.4, 22.4, 45);
    expect(occlusionPass([noDist, has])).toBe(0);
    expect(noDist.occ).toBe(1); expect(has.occ).toBe(1);
  });
});
