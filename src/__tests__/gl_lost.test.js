// Siklus 172 — ketahanan konteks WebGL (GPU reset / driver crash / tab mobile
// dibuang OS): sampling FPS jadi tak bermakna (render() three r183 no-op
// seketika saat _isContextLost → frame tetap terhitung di kecepatan display)
// → perfStep harus menganggap sampel jelata (pola stale 148), recovery tangga
// tidak boleh terisi streak semu, dan perfChip menampilkan status "GPU
// terputus…" yang MENIMPA semua status lain — walau fps belum ada sama sekali.
// Wiring listener nyata (webglcontextlost/restored di OfficeScene) diverifikasi
// live via scripts/e2e_gl_lost.py (WEBGL_lose_context, CDP :99) + kontrak
// statis sumber di bagian akhir file ini.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { perfStep, perfChip } from '../scene/parts/perf_quality.js';

function mockRenderer(pr) {
  let p = pr;
  return {
    getPixelRatio: () => p,
    setPixelRatio: (v) => { p = v; },
    get current() { return p; },
  };
}
function mockSun() {
  return {
    castShadow: true,
    shadow: {
      mapSize: { set: () => {} },
      map: { disposed: false, dispose() { this.disposed = true; } },
    },
  };
}
const BASE = { t0: 0, lastFrame: 0, fps: 0, downgraded: false, shadowLevel: 0, goodStreak: 0, basePR: 0 };

describe('perfStep — flag glLost (konteks WebGL hilang)', () => {
  it('glLost disuntik dari opts (sumber kebenaran pemilik listener) → sampel jelata: fps tak dihitung, jendela di-reset', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    const s = perfStep({ ...BASE, t0: 1000, lastFrame: 2 }, 3000, 4, { renderer: r, sun, glLost: () => true });
    expect(s.glLost).toBe(true);
    expect(s.stale).toBe(true);
    expect(s.fps).toBe(0);          // TIDAK dihitung (nilai lama dibiarkan)
    expect(s.t0).toBe(3000);        // jendela di-reset
    expect(s.lastFrame).toBe(4);
  });

  it('injeksi terjadi SEBELUM guard t0 — konteks hilang sebelum sampel pertama pun tertandai', () => {
    const s = perfStep({ ...BASE }, 1000, 0, { glLost: () => true });
    expect(s.t0).toBe(1000);   // jalur sampel-pertama
    expect(s.glLost).toBe(true);
  });

  it('tangga degradasi DIAM: pixelRatio & bayangan tak tersentuh walau frame terus berjalan', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let needsUpdate = 0;
    const s = perfStep({ ...BASE, t0: 1000, lastFrame: 2 }, 3000, 400, {
      renderer: r, sun, needsShadowUpdate: () => needsUpdate++, glLost: () => true,
    });
    expect(r.current).toBe(1.5);       // pixelRatio utuh
    expect(s.downgraded).toBe(false);
    expect(s.shadowLevel).toBe(0);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.map).not.toBe(null);
    expect(needsUpdate).toBe(0);
  });

  it('recovery tangga TIDAK terisi streak semu: goodStreak & shadowStreak di-reset, L2 tak menyala ulang', () => {
    const r = mockRenderer(1.5);
    const sun = mockSun();
    sun.castShadow = false; // L2 aktif
    const s = perfStep({ ...BASE, t0: 1000, lastFrame: 2, downgraded: true, goodStreak: 3, shadowLevel: 2, shadowStreak: 7 }, 3000, 400, {
      renderer: r, sun, glLost: () => true,
    });
    expect(s.goodStreak).toBe(0);
    expect(s.shadowStreak).toBe(0);
    expect(s.recovering).toBe(false);
    expect(sun.castShadow).toBe(false); // bayangan TIDAK dihidupkan ulang di tengah kegagalan GPU
    expect(s.shadowLevel).toBe(2);
  });

  it('pasca-restore (pemilik melaporkan false): flag bersih, jendela segar → sampel berikut valid kembali', () => {
    const r = mockRenderer(1.5);
    let s = perfStep({ ...BASE, t0: 1000 }, 3000, 4, { renderer: r, glLost: () => true });
    expect(s.glLost).toBe(true);
    // pemilik listener (OfficeScene) mengangkat flag saat webglcontextrestored;
    // frame pertama pasca-restore melaporkan false → injeksi membersihkan state.
    s = perfStep(s, 5200, 130, { renderer: r, glLost: () => false });
    expect(s.glLost).toBe(false);
    expect(s.stale).toBe(false);
    expect(s.fps).toBeGreaterThan(0); // sampling hidup lagi (jendela sudah segar)
  });

  it('tanpa opts.glLost: state lama dipertahankan (kompatibel pemanggil lama), tanpa opts + state bersih → sampling normal', () => {
    // pemanggil lama tanpa opts.glLost → tak ada injeksi; spread mempertahankan flag basi
    const s1 = perfStep({ ...BASE, t0: 1000, glLost: true }, 3000, 4, {});
    expect(s1.glLost).toBe(true);
    // state bersih + tanpa opts.glLost → sampling normal penuh
    const s2 = perfStep({ ...BASE, t0: 1000, lastFrame: 2 }, 3000, 122, { renderer: mockRenderer(1.5) });
    expect(s2.fps).toBe(60);
    expect(s2.glLost).toBeUndefined();
  });
});

describe('perfChip — status konteks WebGL hilang menimpa semuanya', () => {
  it('glLost → "GPU terputus…" (down) walau fps palsu tinggi (frame no-op di kecepatan display)', () => {
    const c = perfChip({ glLost: true, fps: 60, pixelRatio: 1.5 });
    expect(c.state).toBe('down');
    expect(c.label).toBe('GPU terputus…');
    expect(c.detail).toContain('WebGL');
  });

  it('glLost dengan fps 0/kosong → chip TETAP tampil (dulu: null → pengguna melihat kanvas hitam tanpa penjelasan)', () => {
    expect(perfChip({ glLost: true }).state).toBe('down');
    expect(perfChip({ glLost: true, fps: 0 }).state).toBe('down');
  });

  it('tanpa glLost: perilaku lama utuh (null tanpa data, ideal saat sehat)', () => {
    expect(perfChip(null)).toBe(null);
    expect(perfChip({ fps: 0 })).toBe(null);
    const ok = perfChip({ fps: 60, pixelRatio: 1.5 });
    expect(ok.state).toBe('ideal');
    expect(ok.label).toContain('60');
  });
});

describe('sumber — kontrak statis wiring konteks WebGL (siklus 172)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8');
  const hooks = readFileSync(join(here, '../scene/parts/scene_hooks.js'), 'utf8');

  it('OfficeScene memasang listener lost+restored dgn preventDefault (syarat spesifikasi agar restore dipicu)', () => {
    expect(scene).toContain("__onCanvas('webglcontextlost'");
    expect(scene).toContain("__onCanvas('webglcontextrestored'");
    expect(scene).toContain('ev.preventDefault()');
  });

  it('flag di-suntikkan ke perfStep & di-reset saat destroy (forceContextLoss tak boleh mengangkat flag scene mati)', () => {
    expect(scene).toContain('glLost: () => __glLost');
    expect(scene).toContain('__glLost=false'); // destroy(), sebelum forceContextLoss()
  });

  it('restore memaksa refresh peta bayangan (peta lama gugur saat konteks hilang)', () => {
    expect(scene).toContain('renderer.shadowMap.needsUpdate=true');
  });

  it('hook __glLost terdaftar di SCENE_HOOKS (purge destroy menjangkaunya)', () => {
    expect(hooks).toContain("'__glLost'");
  });
});
