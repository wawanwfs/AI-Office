import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zoomRadius, zoomFocusGoal, pinchRadius } from '../scene/parts/zoom_spec.js';

describe('zoomRadius', () => {
  it('langkah normal: current + delta (mirror eksak formula wheel lama)', () => {
    expect(zoomRadius(40, 10)).toBe(50);
    expect(zoomRadius(40, -10)).toBe(30);
    expect(zoomRadius(40, 0)).toBe(40);
  });

  it('clamp bawah 12 (mirror Math.max(12, ...) lama)', () => {
    expect(zoomRadius(14, -10)).toBe(12);
    expect(zoomRadius(12, -4)).toBe(12);
  });

  it('clamp atas 130 (mirror Math.min(130, ...) lama)', () => {
    expect(zoomRadius(128, 10)).toBe(130);
    expect(zoomRadius(130, 4)).toBe(130);
  });

  it('current non-finite → fallback 42.5 (anti-poisoning, dulu NaN menular ke sph.radius)', () => {
    expect(zoomRadius(NaN, 4)).toBe(46.5);
    expect(zoomRadius(Infinity, -4)).toBe(38.5);
    expect(zoomRadius(undefined, 4)).toBe(46.5);
  });

  it('delta non-finite → no-op (delta 0)', () => {
    expect(zoomRadius(40, NaN)).toBe(40);
    expect(zoomRadius(40, Infinity)).toBe(40);
  });
});

describe('zoomFocusGoal', () => {
  const mkGoal = (r, extra = {}) => ({ r, ...extra });

  it('goal follow: r dimutasi dgn delta, objek sama (goal dipertahankan)', () => {
    const g = mkGoal(20, { follow: { walker: {} } });
    const out = zoomFocusGoal(g, -4);
    expect(out).toBe(g);
    expect(g.r).toBe(16);
    expect(g.follow).toBeDefined();
  });

  it('goal reset TIDAK disentuh (return null) — radius dikelola lerp dgn r goal yang digeser OfficeScene', () => {
    const g = mkGoal(30, { reset: true });
    expect(zoomFocusGoal(g, -4)).toBeNull();
    expect(g.r).toBe(30);
  });

  it('goal titik statis (lantai/tim/nexus): r dimutasi, follow tetap undefined', () => {
    const g = mkGoal(18);
    const out = zoomFocusGoal(g, 4);
    expect(out).toBe(g);
    expect(g.r).toBe(22);
    expect(out.follow).toBeUndefined();
  });

  it('null/tanpa goal → null (pemanggil hanya mengubah sph.radius)', () => {
    expect(zoomFocusGoal(null, -4)).toBeNull();
  });

  it('r non-finite → fallback 42.5 lalu digeser (anti-poisoning)', () => {
    const g = mkGoal(NaN);
    zoomFocusGoal(g, -4);
    expect(g.r).toBe(38.5);
  });

  it('clamp 12..130 konsisten dgn formula wheel', () => {
    const g = mkGoal(129);
    zoomFocusGoal(g, 4);
    expect(g.r).toBe(130);
    const g2 = mkGoal(13);
    zoomFocusGoal(g2, -4);
    expect(g2.r).toBe(12);
  });

  it('clamp custom diteruskan (kompatibilitas future)', () => {
    const g = mkGoal(8);
    zoomFocusGoal(g, -4, 6, 20);
    expect(g.r).toBe(6);
  });
});

// Siklus 174 — pinch-zoom mobile menyatu ke kontrak zoom jujur & satu sumber
// radius (dulu jalur lama: clamp inline mentah + focusGoal=null diam-diam).
describe('pinchRadius (siklus 174 — satu sumber radius pinch)', () => {
  it('jari melebar (dist naik) → radius mengecil = zoom IN (mirror formula lama .05)', () => {
    expect(pinchRadius(42.5, 100, 110)).toBe(42);   // 42.5 − 10×0.05
  });

  it('jari merapat (dist turun) → radius membesar = zoom OUT', () => {
    expect(pinchRadius(42.5, 100, 90)).toBe(43);    // 42.5 + 10×0.05
  });

  it('clamp bawah 12 & atas 130 (satu sumber dgn zoomRadius)', () => {
    expect(pinchRadius(12.2, 100, 200)).toBe(12);   // 12.2 − 5 → clamp
    expect(pinchRadius(129.8, 200, 100)).toBe(130); // 129.8 + 5 → clamp
  });

  it('current non-finite → fallback 42.5 (anti-poisoning, NaN tak menular ke sph.radius)', () => {
    expect(pinchRadius(NaN, 100, 110)).toBe(42);
  });

  it('jarak jari non-finite → delta 0 (pinch gegabah tak menggeser kamera, bukan delta raksasa)', () => {
    expect(pinchRadius(42.5, NaN, 110)).toBe(42.5);
    expect(pinchRadius(42.5, 100, NaN)).toBe(42.5);
  });

  it('scale custom diteruskan (sensitivitas eksperimen tanpa sentuh OfficeScene)', () => {
    expect(pinchRadius(42.5, 100, 110, 0.1)).toBe(41.5);  // 42.5 − 10×0.1
  });

  it('delta 0 (jarak tetap) → nilai tetap', () => {
    expect(pinchRadius(42.5, 100, 100)).toBe(42.5);
  });
});

// Siklus 174 — kontrak statis wiring handler pinch OfficeScene (pola kontrak
// statis siklus 172: wiring nyata di-diverifikasi live via e2e CDP).
describe('sumber — kontrak statis wiring pinch-zoom (siklus 174)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8');

  it('radius pinch lewat satu sumber pinchRadius — clamp inline mentah tidak ada lagi', () => {
    expect(scene).toContain('sph.radius=pinchRadius(sph.radius,pinchDist,d)');
    expect(scene).not.toContain('Math.max(12,Math.min(130,sph.radius');
  });

  it('pinch zoom JUJUR: goal TIDAK dibatalkan — radius goal ikut digeser via zoomFocusGoal', () => {
    expect(scene).toContain('if(focusGoal)zoomFocusGoal(focusGoal,zoomRadius(sph.radius,0)-sph.radius)');
    expect(scene).not.toContain('if(focusGoal&&!focusGoal.reset)focusGoal=null');
  });

  it('2 jari = pinch, bukan drag: pinchActive menahan drag putar (handler & onDragMove)', () => {
    expect(scene).toContain('pinchActive=true');
    expect(scene).toContain('isDrag=false; // batal drag putar');
    expect(scene).toContain('if(!isDrag||pinchActive)return');
  });

  it('pinch ditutup bersih: touchend membaca e.touches (dulu pinchDist=null tanpa syarat)', () => {
    expect(scene).toContain("if(pinchActive&&e.touches.length<2)");
  });
});
