import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dblclickPointGoal, dblclickBlankGoal, tapCandidate, isDoubleTap, dtapRadius, DTAP_ZOOM_STEP } from '../scene/parts/dblclick_spec.js';
import { zoomRadius } from '../scene/parts/zoom_spec.js';
import { agentFocusPos } from '../scene/parts/kamera_focus.js';

// Siklus 118 — perilaku dblclick kanvas (diekstrak dari inline OfficeScene).
// Regresi: dblclick agen/nexus dulu jatuh ke goal titik generik STATIS tanpa
// follow → menimpa goal follow klik pertama (kamera berhenti mengikuti agen
// berjalan); jalur agen juga skip saveCam/ensureHomeRadius (Escape rusak).

describe('agentFocusPos (kamera_focus)', () => {
  it('walker visible → posisi walker +1.5 (formula sama dgn updateFollowGoal)', () => {
    const a = { home: { x: 4, y: 0, z: 1.5 }, walker: { visible: true, position: { x: -2, y: 1.2, z: 7 } } };
    expect(agentFocusPos(a)).toEqual({ x: -2, y: 2.7, z: 7 });
  });
  it('walker tidak visible → posisi home +1.5 (bukan null)', () => {
    const a = { home: { x: 4, y: 0, z: 1.5 }, walker: { visible: false, position: { x: 99, y: 0, z: 99 } } };
    expect(agentFocusPos(a)).toEqual({ x: 4, y: 1.5, z: 1.5 });
  });
  it('home bertingkat (y=3.2) → elevasi lantai dihitung', () => {
    const a = { home: { x: 1, y: 3.2, z: 2 }, walker: { visible: false } };
    expect(agentFocusPos(a)).toEqual({ x: 1, y: 4.7, z: 2 });
  });
  it('agen tanpa home → null (dulu formula lama melempar exception)', () => {
    expect(agentFocusPos(null)).toBeNull();
    expect(agentFocusPos({})).toBeNull();
    expect(agentFocusPos({ walker: { visible: true, position: { x: 1, y: 0, z: 1 } } })).toBeNull();
  });
});

describe('dblclickPointGoal', () => {
  it('goal titik: y di-clamp ≥ +0.8, r = min(radius, 18)', () => {
    const g = dblclickPointGoal({ x: 3, y: 0.2, z: -5 }, 30);
    expect(g).toEqual({ t: { x: 3, y: 1.5, z: -5 }, r: 18 });
  });
  it('radius kecil (25) dipertahankan min(25,18)=18; y tinggi ikut +0.8', () => {
    const g = dblclickPointGoal({ x: 0, y: 4.4, z: 0 }, 25);
    expect(g.r).toBe(18);
    expect(g.t.y).toBeCloseTo(5.2);
  });
  it('point y undefined → 0 + 0.8 clamp 1.5', () => {
    const g = dblclickPointGoal({ x: 1, z: 1 }, 40);
    expect(g.t.y).toBe(1.5);
  });
  it('null/koordinat tak valid → null (goal lama dibiarkan)', () => {
    expect(dblclickPointGoal(null, 40)).toBeNull();
    expect(dblclickPointGoal({ x: NaN, y: 0, z: 1 }, 40)).toBeNull();
    expect(dblclickPointGoal({ x: 1, y: 0, z: undefined }, 40)).toBeNull();
  });
  it('radius NaN/undefined → fallback 42.5 lalu min(…,18)=18', () => {
    expect(dblclickPointGoal({ x: 1, y: 0, z: 1 }, NaN).r).toBe(18);
    expect(dblclickPointGoal({ x: 1, y: 0, z: 1 }, undefined).r).toBe(18);
  });
});

describe('dblclickBlankGoal', () => {
  it('area kosong: maju 30% (r = max(14, radius*0.7)) ke target orbit', () => {
    const g = dblclickBlankGoal({ x: 0, y: 1.0, z: 0.6 }, 40);
    expect(g.r).toBe(28);
    expect(g.t).toEqual({ x: 0, y: 1.0, z: 0.6 });
  });
  it('radius kecil → floor 14 (tidak lebih dekat dari 14)', () => {
    expect(dblclickBlankGoal({ x: 0, y: 1, z: 0 }, 18).r).toBe(14);
  });
  it('tgt tak valid → fallback target HOME (0,1,0.6)', () => {
    expect(dblclickBlankGoal(null, 40).t).toEqual({ x: 0, y: 1.0, z: 0.6 });
    expect(dblclickBlankGoal({ x: NaN, y: 1, z: 0 }, 40).t).toEqual({ x: 0, y: 1.0, z: 0.6 });
  });
  it('tgt.y undefined → 1.0', () => {
    expect(dblclickBlankGoal({ x: 5, z: 5 }, 40).t.y).toBe(1.0);
  });
});

// Siklus 175 — double-tap mobile (padanan dblclick mouse di layar sentuh).
// Gerbang murni di dblclick_spec; wiring di OfficeScene diverifikasi live via
// e2e CDP (pola kontrak statis 174) — tap geser & press-and-hold TIDAK lolos.
describe('double-tap mobile (siklus 175)', () => {
  const tap = (x, y, t0, t1) => ({ x0: x, y0: y, x1: x, y1: y, t0, t1 });

  describe('tapCandidate — tap tunggal valid', () => {
    it('tap cepat di tempat → kandidat', () => {
      expect(tapCandidate(tap(300, 400, 100, 160))).toBe(true);
    });
    it('tap geser >24px → BUKAN kandidat (drag putar)', () => {
      expect(tapCandidate({ x0: 300, y0: 400, x1: 336, y1: 400, t0: 100, t1: 160 })).toBe(false);
      expect(tapCandidate({ x0: 300, y0: 400, x1: 300, y1: 430, t0: 100, t1: 160 })).toBe(false);
    });
    it('tap pas di tepi slop (24px eksak) → masih kandidat', () => {
      expect(tapCandidate({ x0: 300, y0: 400, x1: 324, y1: 400, t0: 0, t1: 100 })).toBe(true);
    });
    it('press-and-hold >300ms → BUKAN kandidat (tekan-lama = konteks)', () => {
      expect(tapCandidate(tap(300, 400, 100, 401))).toBe(false);
    });
    it('tap tepat 300ms → masih kandidat (batas inklusif)', () => {
      expect(tapCandidate(tap(300, 400, 100, 400))).toBe(true);
    });
  });

  describe('isDoubleTap — pasangan tap', () => {
    it('dua tap cepat berdekatan → double-tap', () => {
      expect(isDoubleTap(tap(300, 400, 100, 150), tap(302, 402, 400, 450))).toBe(true);
    });
    it('jarak antar tap >36px → bukan (dua tap di tempat beda)', () => {
      expect(isDoubleTap(tap(300, 400, 100, 150), tap(340, 400, 400, 450))).toBe(false);
    });
    it('jarak antar tap pas 36px → masih double-tap (batas inklusif)', () => {
      expect(isDoubleTap(tap(300, 400, 100, 150), tap(336, 400, 400, 450))).toBe(true);
    });
    it('jeda antar tap >350ms → bukan (dua tap lambat)', () => {
      expect(isDoubleTap(tap(300, 400, 100, 150), tap(300, 400, 600, 650))).toBe(false);
    });
    it('tap kedua lambat (>300ms ditekan) → bukan walau posisinya pas', () => {
      expect(isDoubleTap(tap(300, 400, 100, 150), tap(300, 400, 400, 750))).toBe(false);
    });
    it('tap pertama tak valid (drag) → bukan walau tap kedua baik', () => {
      expect(isDoubleTap({ x0: 300, y0: 400, x1: 400, y1: 400, t0: 0, t1: 50 }, tap(300, 400, 400, 450))).toBe(false);
    });
    it('null → false (tap pertama belum ada)', () => {
      expect(isDoubleTap(null, tap(300, 400, 400, 450))).toBe(false);
      expect(isDoubleTap(tap(300, 400, 100, 150), null)).toBe(false);
    });
  });

  describe('dtapRadius — satu sumber dgn zoomRadius (clamp 12..130)', () => {
    it('zoom IN: radius ×0.82 → 42.5 menjadi ~34.85', () => {
      const r = dtapRadius(42.5, DTAP_ZOOM_STEP, 1, zoomRadius);
      expect(r).toBeCloseTo(42.5 * DTAP_ZOOM_STEP, 5);
    });
    it('tanpa sumber zoomRadiusFn → no-op (bukan crash / NaN)', () => {
      expect(dtapRadius(42.5, DTAP_ZOOM_STEP, 1)).toBe(42.5);
      expect(dtapRadius(42.5, DTAP_ZOOM_STEP, 1, null)).toBe(42.5);
    });
    it('clamp bawah 12 — tap-ganda terus tak menembus lantai zoom', () => {
      let r = 14;
      for (let i = 0; i < 8; i++) r = dtapRadius(r, DTAP_ZOOM_STEP, 1, zoomRadius);
      expect(r).toBe(12);
    });
    it('clamp atas 130 — arah keluar tak menembus plafon zoom', () => {
      let r = 120;
      for (let i = 0; i < 8; i++) r = dtapRadius(r, DTAP_ZOOM_STEP, -1, zoomRadius);
      expect(r).toBe(130);
    });
    it('anti-poisoning: radius NaN tidak menular (fallback 42.5)', () => {
      expect(dtapRadius(NaN, DTAP_ZOOM_STEP, 1, zoomRadius)).toBe(42.5);
    });
    it('arah -1 = zoom keluar (radius membesar)', () => {
      expect(dtapRadius(42.5, DTAP_ZOOM_STEP, -1, zoomRadius)).toBeGreaterThan(42.5);
    });
  });

  describe('kontrak statis wiring OfficeScene (pola 174)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8');

    it('double-tap zoom lewat satu sumber dtapRadius — clamp inline mentah tidak ada lagi', () => {
      expect(scene).toContain('dtapRadius(sph.radius,DTAP_ZOOM_STEP,1,zoomRadius)');
    });
    it('double-tap ZOOM JUJUR: goal ikut digeser via zoomFocusGoal (bukan dibatalkan)', () => {
      expect(scene).toContain('if(focusGoal)zoomFocusGoal(focusGoal,sph.radius-__r0)');
    });
    it('touch-action:none pada kanvas — syarat tap-ganda tak dibajak zoom halaman', () => {
      expect(scene).toContain("touchAction='none'");
    });
    it('pinchGuard menahan klik pointerup + dibuang bersama downXY', () => {
      expect(scene).toContain('if(pinchGuard){downXY=null;return;}');
    });
    it('pinch menandai guard & memutus pasangan tap; cancel mereset semua state gestur', () => {
      expect(scene).toContain('pinchGuard=true');
      expect(scene).toContain('pinchGuard=false');
      expect(scene).toContain('dtapLast=null;');
      expect(scene).toContain("__onCanvas('touchcancel'");
      expect(scene).toContain('pinchDist=null;pinchActive=false;pinchGuard=false;dtapLast=null;__tapDown=null;');
    });
  });
});
