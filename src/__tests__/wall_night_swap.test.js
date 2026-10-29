// Siklus 165 — dinding kantor ikut siang↔malam (wall_canvas + walls + daycycle).
// Dulu 8 tekstur dinding (panel atas pucat #E6EAF1 + wainscot kayu #8A6244)
// digambar SEKALI dgn palet siang via MeshBasicMaterial ("tidak bergantung
// pencahayaan") — jam malam (daylight 0.3, latar NAVY, jendela malam sejak
// siklus 164) dinding tetap terang penuh. Kini createLighting me-repaint kanvas
// dinding dgn palet WALL_NIGHT lewat paintWallNight dari createWalls.
import { describe, it, expect, vi } from 'vitest';
import { drawWallTex, WALL_TEX_TOP, WALL_TEX_BOTTOM, WALL_NIGHT } from '../scene/parts/wall_canvas.js';
import { createLighting } from '../scene/parts/daycycle.js';

// ── palet malam diekspor & BERBEDA dgn palet siang (bukan klon angka sama) ──
describe('WALL_NIGHT — palet dinding malam', () => {
  it('panel atas malam gelap, BUKAN pucat siang #E6EAF1', () => {
    expect(WALL_NIGHT.upper.base).toBe('#1B2436');
    expect(WALL_NIGHT.upper.base).not.toBe('#E6EAF1');
  });
  it('kayu wainscot malam tetap kayu (coklat), bukan abu/netral', () => {
    expect(WALL_NIGHT.wood.base).toBe('#3B2B1D');
    // hex kayu: kanal R > B (coklat hangat), bukan biru panel
    expect(parseInt('3B', 16)).toBeGreaterThan(parseInt('1D', 16));
  });
  it('gradien top/bottom drawWallTex tak berubah (kontrak painter dipertahankan)', () => {
    expect(WALL_TEX_TOP).toBe('rgba(255,255,255,.12)');
    expect(WALL_TEX_BOTTOM).toBe('rgba(0,0,0,.08)');
  });
  it('repaint malam = painter parametrik dipanggil dgn warna palet malam (bukan API baru)', () => {
    const ops = [];
    const ctx = {
      fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect: (...a) => ops.push(['fillRect', a[2]]),
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    };
    drawWallTex(ctx, WALL_NIGHT.upper.base, WALL_NIGHT.upper.line, 512, 256, 64);
    // fillRect pertama = warna dasar palet malam (fillRect(x,y,w,h) → cek via fillStyle terakhir sebelum call)
    expect(ctx.fillStyle).toBe(WALL_NIGHT.upper.base);
    expect(ops.length).toBeGreaterThan(0);
  });
});

// ── integrasi createLighting: apply() memicu repaint dinding sesuai daylight ──
function makeHarness() {
  const calls = [];
  const wallPainter = {
    paintWallNight: (night) => { calls.push(night); return 8; },
  };
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    wallPainter,
  };
  return { ctx, calls };
}

describe('createLighting — repaint dinding sesuai waktu (siklus 165)', () => {
  it('malam (60): paintWallNight(true) terpanggil, wallNight=true', () => {
    const { ctx, calls } = makeHarness();
    const L = createLighting(ctx);
    L.apply(60);
    expect(calls).toEqual([true]);
    expect(L.wallNight).toBe(true);
  });
  it('siang (720): repaint balik ke siang — false terpanggil setelah malam', () => {
    const { ctx, calls } = makeHarness();
    const L = createLighting(ctx);
    L.apply(60); // malam
    L.apply(720); // siang
    expect(calls).toEqual([true, false]);
    expect(L.wallNight).toBe(false);
  });
  it('load langsung siang: 0 repaint (kanvas init sudah palet siang)', () => {
    const { ctx, calls } = makeHarness();
    const L = createLighting(ctx);
    L.apply(720); L.apply(721);
    expect(calls).toEqual([]);
    expect(L.wallNight).toBe(false);
  });
  it('idempoten: malam terus = 1 repaint saja (hemat GPU, 0 biaya per tick)', () => {
    const { ctx, calls } = makeHarness();
    const L = createLighting(ctx);
    L.apply(0); L.apply(30); L.apply(90);
    expect(calls).toEqual([true]);
  });
  it('senja 1100 (daylight ≈ 0.44 < 0.55) → sudah malam; ambang sama dgn jendela', () => {
    const { ctx, calls } = makeHarness();
    const L = createLighting(ctx);
    L.apply(1100);
    expect(calls).toEqual([true]);
  });
  it('tanpa wallPainter (harness lama): apply aman tanpa error — sky swap tetap jalan', () => {
    const L = createLighting({
      ambient: { intensity: 1 }, sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 }, scene: { background: null, fog: { color: null } },
      agentData: [], THREE: { Color: class {} },
    });
    expect(() => L.apply(60)).not.toThrow();
    expect(L.skyNight).toBe(true);
    expect(L.wallNight).toBe(false);
  });
});
