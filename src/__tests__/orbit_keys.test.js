import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orbitStep, orbitFocusGoal, ORBIT_KEY_STEP, ORBIT_KEY_STEP_FAST, PHI_MIN, PHI_MAX } from '../scene/parts/orbit_spec.js';

// Siklus 177 — orbit kamera via KEYBOARD (panah): satu-satunya jalur input
// kamera yang belum ada — audit pointer 174/175/176 tuntas tapi PUTAR kamera
// hanya bisa drag pointer (tanpa mouse: tak ada cara memutar kantor).
// Kontrak: murni (objek baru, input tak dimutasi), clamp phi eksak dgn
// updCam produksi (0.18..π/2.3), anti-poisoning (NaN → basis isometrik
// tanpa langkah), Shift = 3× cepat, tombol bukan-panah no-op, goal kamera
// TIDAK tersentuh orbit (orbitFocusGoal = identitas — follow tetap hidup).

const S = { theta: 2.45, phi: 0.92 };

describe('orbitStep — murni & arah', () => {
  it('mengembalikan objek BARU — input tidak dimutasi', () => {
    const out = orbitStep(S, 'ArrowLeft');
    expect(out).not.toBe(S);
    expect(S.theta).toBe(2.45);
    expect(S.phi).toBe(0.92);
    expect(out.theta).toBeCloseTo(S.theta + ORBIT_KEY_STEP, 10);
    expect(out.phi).toBe(0.92);
  });

  it('kiri = theta bertambah, kanan = theta berkurang (arah sama dgn drag)', () => {
    expect(orbitStep(S, 'ArrowLeft').theta).toBeCloseTo(2.45 + 0.12, 10);
    expect(orbitStep(S, 'ArrowRight').theta).toBeCloseTo(2.45 - 0.12, 10);
  });

  it('atas = phi berkurang (kamera naik), bawah = phi bertambah (kamera turun)', () => {
    expect(orbitStep(S, 'ArrowUp').phi).toBeCloseTo(0.92 - 0.12, 10);
    expect(orbitStep(S, 'ArrowDown').phi).toBeCloseTo(0.92 + 0.12, 10);
  });

  it('tombol bukan-panah → no-op (theta & phi tetap)', () => {
    const out = orbitStep(S, 'a'); // bukan panah
    expect(out.theta).toBe(2.45);
    expect(out.phi).toBe(0.92);
  });

  it('step eksplisit dipakai (Shift = ORBIT_KEY_STEP_FAST 3×)', () => {
    const out = orbitStep(S, 'ArrowLeft', ORBIT_KEY_STEP_FAST);
    expect(out.theta).toBeCloseTo(2.45 + 0.36, 10);
    expect(ORBIT_KEY_STEP_FAST).toBeCloseTo(ORBIT_KEY_STEP * 3, 10);
  });
});

describe('orbitStep — clamp phi (mirror updCam) & anti-poisoning', () => {
  it('panah bawah berulang tak pernah menembus PHI_MAX (lantai kamera)', () => {
    let p = { theta: 1.0, phi: 0.92 };
    for (let i = 0; i < 100; i++) p = orbitStep(p, 'ArrowDown');
    expect(p.phi).toBe(PHI_MAX);
    expect(Number.isFinite(p.theta)).toBe(true);
  });

  it('panah atas berulang tak pernah menembus PHI_MIN (membalik kamera)', () => {
    let p = { theta: 1.0, phi: 0.92 };
    for (let i = 0; i < 100; i++) p = orbitStep(p, 'ArrowUp');
    expect(p.phi).toBe(PHI_MIN);
  });

  it('PHI_MIN/PHI_MAX = clamp eksak updCam produksi (0.18, π/2.3)', () => {
    expect(PHI_MIN).toBe(0.18);
    expect(PHI_MAX).toBeCloseTo(Math.PI / 2.3, 12);
  });

  it('state teracuni NaN/undefined → pulih ke basis isometrik TANPA langkah', () => {
    const out = orbitStep({ theta: NaN, phi: 0.92 }, 'ArrowLeft');
    expect(out.theta).toBeCloseTo(Math.PI * 0.78, 12);
    expect(out.phi).toBe(0.92);
    const out2 = orbitStep(undefined, 'ArrowUp');
    expect(out2.phi).toBe(0.92);
    expect(out2.theta).toBeCloseTo(Math.PI * 0.78, 12);
  });

  it('step NaN → langkah 0 (orbit gegabah tak menggeser kamera); undefined = default', () => {
    const out = orbitStep(S, 'ArrowLeft', NaN);
    expect(out.theta).toBe(2.45);
    const out2 = orbitStep(S, 'ArrowDown', undefined); // default param = ORBIT_KEY_STEP
    expect(out2.phi).toBeCloseTo(0.92 + ORBIT_KEY_STEP, 10);
  });
});

describe('orbitFocusGoal — kontrak goal utuh', () => {
  it('goal follow TIDAK dibatalkan & tidak diubah (orbit = memutar sekeliling target)', () => {
    const g = { t: { x: 1, y: 2, z: 3 }, r: 14, follow: { walker: {} }, reset: false };
    expect(orbitFocusGoal(g)).toBe(g);
  });
  it('goal null → null (tak pernah melempar)', () => {
    expect(orbitFocusGoal(null)).toBe(null);
  });
});

describe('sumber — kontrak statis wiring orbit keyboard (siklus 177)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8');
  const spec = readFileSync(join(here, '../scene/parts/shortcut_spec.js'), 'utf8');

  it('listener keydown orbit terpasang & dilepas di destroy (anti bocor listener)', () => {
    expect(scene).toContain("window.addEventListener('keydown',__onOrbitKey)");
    expect(scene).toContain("window.removeEventListener('keydown', __onOrbitKey)");
  });

  it('mencegah default panah (bukan scroll halaman) & membaca Shift utk langkah cepat', () => {
    expect(scene).toContain('e.preventDefault()');
    expect(scene).toContain('e.shiftKey?ORBIT_KEY_STEP_FAST:ORBIT_KEY_STEP');
  });

  it('mengedit sph & memanggil updCam (kamera benar-benar bergerak)', () => {
    expect(scene).toContain('sph.theta=n.theta;sph.phi=n.phi;');
    expect(scene).toContain('orbitFocusGoal(focusGoal)');
  });

  it('guard modal & guard input sedang mengetik (keyboard milik modal/field)', () => {
    expect(scene).toContain('__wfsModalOpen||window.__escModalAtDispatch');
    expect(scene).toContain("t.isContentEditable");
  });

  it('satu sumber: tanpa formula langkah inline di OfficeScene (delegasi orbitStep)', () => {
    // Formula mentah 0.12/0.36 hanya boleh hidup di orbit_spec.js
    expect(scene).not.toMatch(/theta[+-]=0\.12|theta[+-]=0\.36|phi[+-]=0\.12|phi[+-]=0\.36/);
    expect(scene).toContain('orbitStep(sph,e.key');
  });

  it('shortcut dokumentasi: Panah terdaftar di navigasi & ringkasan bantuan', () => {
    expect(spec).toContain("key: 'Panah'");
    expect(spec).toContain('Panah = orbit kamera (Shift = cepat)');
  });

  it('hook probe __orbitStep terdaftar di SCENE_HOOKS (purge destroy)', () => {
    const hooks = readFileSync(join(here, '../scene/parts/scene_hooks.js'), 'utf8');
    expect(hooks).toContain("'__orbitStep'");
    expect(scene).toContain('window.__orbitStep=__orbitStepProbe');
  });
});
