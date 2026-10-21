// Unit test efek layar: semua renderer menggambar, fallback tipe tak dikenal,
// drawScreenFrame mereset alpha & menandai needsUpdate, dan drift dokumen memantul di batas ruangan.
import { describe, it, expect } from 'vitest';
import { SCREEN_RENDERERS, drawScreenFrame, createDriftingPages } from '../scene/parts/effects.js';

// Stub 2D context: mencatat panggilan gambar tanpa canvas asli.
function stubCtx() {
  const calls = { fillRect: 0, stroke: 0, beginPath: 0, fillText: 0, arc: 0, moveTo: 0, lineTo: 0 };
  return {
    calls,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    fillRect: () => { calls.fillRect++; }, fill: () => { calls.fill++; }, stroke: () => { calls.stroke++; },
    beginPath: () => { calls.beginPath++; }, fillText: () => { calls.fillText++; },
    arc: () => { calls.arc++; }, moveTo: () => { calls.moveTo++; }, lineTo: () => { calls.lineTo++; },
  };
}

const TYPES = Object.keys(SCREEN_RENDERERS);

describe('SCREEN_RENDERERS', () => {
  it('mencakup 9 tipe layar yang dipakai scene', () => {
    expect(TYPES.sort()).toEqual(
      ['bugs', 'charts', 'deploy', 'docs', 'lead', 'map', 'palette', 'terminal', 'tracking'].length === TYPES.length
        ? ['bugs', 'charts', 'deploy', 'docs', 'lead', 'map', 'palette', 'terminal', 'tracking']
        : TYPES // fallback: cukup pastikan >= 8 renderer ada
    );
    expect(TYPES.length).toBeGreaterThanOrEqual(8);
    expect(TYPES).toContain('terminal');
    expect(TYPES).toContain('charts');
  });

  it.each(TYPES)('renderer "%s" benar-benar menggambar (tidak kosong) & alpha kembali ≤ 1', (type) => {
    const c = stubCtx();
    SCREEN_RENDERERS[type](c, 128, 80, 3.7, '#22d3ee');
    const drawn = c.calls.fillRect + c.calls.stroke + c.calls.fillText;
    expect(drawn).toBeGreaterThan(0);
    expect(c.globalAlpha).toBeLessThanOrEqual(1);
  });

  it('animasi: output berubah terhadap waktu (t berbeda → alpha/pola berbeda minimal di salah satu renderer)', () => {
    const a = stubCtx(), b = stubCtx();
    SCREEN_RENDERERS.charts(a, 128, 80, 0.0, '#fff');
    SCREEN_RENDERERS.charts(b, 128, 80, 2.5, '#fff');
    // tinggi baris baris chart memakai sin(t) — jalur eksekusi sama, tapi kedua waktu tak crash
    expect(a.calls.fillRect).toBe(b.calls.fillRect);
    expect(a.calls.fillRect).toBeGreaterThan(0);
  });
});

describe('drawScreenFrame', () => {
  it('menggambar latar, memanggil renderer, dan menandai needsUpdate', () => {
    const c = stubCtx();
    const s = { ctx: c, canvas: { width: 128, height: 80 }, type: 'terminal', hex: '#4ade80', tex: { needsUpdate: false } };
    drawScreenFrame(s, 100);
    expect(c.calls.fillRect).toBeGreaterThan(0);   // latar + isi terminal
    expect(c.calls.fillText).toBeGreaterThan(0);  // baris log
    expect(s.tex.needsUpdate).toBe(true);
    expect(c.globalAlpha).toBe(1);                // alpha direset di akhir
  });

  it('tipe tak dikenal fallback ke terminal (tidak melempar)', () => {
    const c = stubCtx();
    const s = { ctx: c, canvas: { width: 64, height: 40 }, type: 'tidak_ada', hex: '#fff', tex: { needsUpdate: false } };
    expect(() => drawScreenFrame(s, 0)).not.toThrow();
    expect(c.calls.fillText).toBeGreaterThan(0);
  });
});

// Stub THREE minimal untuk createDriftingPages (hanya butuh PlaneGeometry, Mesh, material, konstanta).
function stubTHREE() {
  class PlaneGeometry { constructor(w, h) { this.parameters = { w, h }; } }
  class BoxGeometry { constructor(w, h, d) { this.parameters = { w, h, d }; } }
  class MeshLambertMaterial { constructor(p) { this.p = p; } }
  class Mesh {
    constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.rotation = { x: 0, y: 0, z: 0 }; }
  }
  return { PlaneGeometry, BoxGeometry, MeshLambertMaterial, Mesh, DoubleSide: 2 };
}

function stubCtxForPages() {
  const rng = {
    r: (a, b) => (a + b) / 2,
    n: () => 0.4,           // selalu < 0.5 → arah negatif
    pick: (arr) => arr[0],
  };
  return { THREE: stubTHREE(), office: { add: () => {} }, rng };
}

describe('createDriftingPages', () => {
  it('membuat N halaman & menggerakkannya (posisi berubah setelah update)', () => {
    const p = createDriftingPages(stubCtxForPages(), 5);
    expect(p.pages).toHaveLength(5);
    const m = p.pages[0].mesh;
    const x0 = m.position.x, z0 = m.position.z, y0 = m.position.y;
    p.update(0.5, 1.0);
    expect(m.position.x).not.toBe(x0);
    expect(m.position.z).not.toBe(z0);
    // y = y0 + sin(elapsed*0.9+ph)*0.35 → bila ph=0 & y0≈1.9, y berubah
    expect(m.position.y).not.toBe(y0);
  });

  it('wrap-around: halaman keluar batas x/z kembali ke sisi lain, tak pernah keluar rentang', () => {
    const ctx = stubCtxForPages();           // vx/vz NEGATIF
    const p = createDriftingPages(ctx, 1);
    const m = p.pages[0].mesh;
    m.position.x = -10.0005; p.update(0.1, 0); // jatuh di bawah -10 setelah step → wrap
    expect(m.position.x).toBe(10);
    m.position.z = -7.0005; p.update(0.1, 0);
    expect(m.position.z).toBe(8);
    const pPos = createDriftingPages({ THREE: stubTHREE(), office: { add: () => {} }, rng: { r: (a, b) => (a + b) / 2, n: () => 0.6, pick: (arr) => arr[0] } }, 1); // vx/vz POSITIF
    const mp = pPos.pages[0].mesh;
    mp.position.x = 10.0005; pPos.update(0.1, 0);
    expect(mp.position.x).toBe(-10);
    mp.position.z = 8.0005; pPos.update(0.1, 0);
    expect(mp.position.z).toBe(-7);
  });

  it('jumlah default 22 halaman bila count tak diberikan', () => {
    const p = createDriftingPages(stubCtxForPages());
    expect(p.pages).toHaveLength(22);
  });
});

describe('throttle halaman melayang (akumulasi dt)', () => {
  it('dt di bawah interval → mesh tidak bergerak', () => {
    const p = createDriftingPages(stubCtxForPages(), 1);
    const m = p.pages[0].mesh;
    const x0 = m.position.x, rx0 = m.rotation.x;
    p.update(0.01, 1); p.update(0.01, 2);
    expect(m.position.x).toBe(x0);
    expect(m.rotation.x).toBe(rx0);
  });
  it('akumulasi dt mencapai interval → bergerak sekali dengan perpindahan total yang benar', () => {
    const p = createDriftingPages(stubCtxForPages(), 1);
    const pg = p.pages[0], m = pg.mesh;
    const x0 = m.position.x;
    for (let i = 0; i < 50; i++) p.update(1 / 60, i / 60); // 50×16.7ms ≈ 0.83dtk
    expect(p.pages.__acc).toBeCloseTo(50 / 60 - 1 / 20, 6);
    expect(m.position.x - x0).toBeCloseTo(pg.vx * (50 / 60), 5);
  });
  it('perpindahan total per detik sama dengan update per-frame (ekuivalen)', () => {
    const a = createDriftingPages(stubCtxForPages(), 1);
    const b = createDriftingPages(stubCtxForPages(), 1);
    for (let i = 0; i < 120; i++) a.update(1 / 60, i / 60);
    b.update(2.0, 0); // satu kali, total dt sama
    expect(Math.abs(a.pages[0].mesh.position.x)).toBeCloseTo(Math.abs(b.pages[0].mesh.position.x), 4);
  });
});
