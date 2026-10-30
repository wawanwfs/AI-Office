import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCK_H_VAR, DOCK_H_MIN, dockHValue, setDockHVar, watchDockHeight } from '../lib/dock_h.js';

// Siklus 184 — dock mobile ADAPTIF: tombol dock kini 24 (siklus 178/182/183
// menambah FOTO/AGEN/MUNDUR) → di layar ≤560px dock membungkus 3–4 baris.
// Dulu: CSS clamp `max-height: 120px` (era 2 baris) + offset HUD/toast statis
// 148/200px → baris terakhir meluap KELUAR kapsul kaca (terukur CDP 390px:
// kapsul berakhir y=826, tombol sampai y=842), bahkan TERPOTONG viewport di
// 360px (bottom 842 > vh 800 — tombol tak bisa diklik). Kini: kapsul tumbuh
// bebas dan App mengukur tinggi dock (ResizeObserver) → CSS var --dock-h →
// offset HUD/toast = tinggi dock + inset. Kontrak yang dijaga:
//   (1) anti-poisoning ketat: tinggi tak valid → null / tidak menulis,
//   (2) fallback CSS 130px tidak pernah dipersempit oleh setter,
//   (3) pengukur live lepas-attach bersih (disconnect) saat unmount.

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

describe('dockHValue — transformasi tinggi → nilai CSS var', () => {
  it('tinggi valid → string px ceil (139.2 → "140px")', () => {
    expect(dockHValue(139.2)).toBe('140px');
  });

  it('tinggi bulat utuh', () => {
    expect(dockHValue(170)).toBe('170px');
  });

  it('di bawah DOCK_H_MIN diangkat ke fallback CSS (jangan lebih sempit dari era statis)', () => {
    expect(dockHValue(80)).toBe(`${DOCK_H_MIN}px`);
  });

  it('anti-poisoning: NaN / Infinity / 0 / negatif / non-number → null (jangan tulis)', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -50, '170', null, undefined]) {
      expect(dockHValue(bad)).toBeNull();
    }
  });
});

describe('setDockHVar — penulisan var idempoten & aman', () => {
  const mkEl = () => ({ style: { props: {}, setProperty(k, v) { this.props[k] = v; } } });

  it('menulis --dock-h px ke target', () => {
    const el = mkEl();
    expect(setDockHVar(170, el)).toBe(true);
    expect(el.style.props['--dock-h']).toBe('170px');
  });

  it('tinggi tak valid → false & TIDAK menyentuh style (fallback CSS tetap)', () => {
    const el = mkEl();
    expect(setDockHVar(NaN, el)).toBe(false);
    expect(el.style.props['--dock-h']).toBeUndefined();
  });

  it('target hilang (SSR) → false, tidak throw', () => {
    expect(setDockHVar(170, null)).toBe(false);
  });

  it('panggil ulang dgn nilai sama → idempoten (nilai akhir konsisten)', () => {
    const el = mkEl();
    setDockHVar(170, el);
    setDockHVar(170, el);
    expect(el.style.props['--dock-h']).toBe('170px');
  });
});

describe('watchDockHeight — pengukur live & cleanup', () => {
  class FakeRO {
    constructor(cb) { FakeRO.last = this; this.cb = cb; this.observed = []; this.disconnected = false; }
    observe(el) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
    fire() { this.cb(); }
  }
  const mkDoc = (dockH) => {
    const docEl = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
    const dock = { clientHeight: dockH };
    return { documentElement: docEl, dock, querySelector: (sel) => (sel === '.dock' ? dock : null) };
  };

  it('mengukur awal: tinggi dock → var ditulis di documentElement', () => {
    const doc = mkDoc(170);
    const stop = watchDockHeight({ doc, roCls: FakeRO });
    expect(stop).toBeTypeOf('function');
    expect(doc.documentElement.style.props['--dock-h']).toBe('170px');
    expect(FakeRO.last.observed).toEqual([doc.dock]);
    stop();
  });

  it('resize (dock bertambah baris) → callback RO menulis ulang var', () => {
    const doc = mkDoc(130);
    const stop = watchDockHeight({ doc, roCls: FakeRO });
    doc.dock.clientHeight = 218;
    FakeRO.last.fire();
    expect(doc.documentElement.style.props['--dock-h']).toBe('218px');
    stop();
  });

  it('dock tidak ada → observe body, ukuran null → tidak menulis (fallback CSS)', () => {
    const docEl = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
    const body = {};
    const doc = { documentElement: docEl, body, querySelector: () => null };
    const stop = watchDockHeight({ doc, roCls: FakeRO });
    expect(FakeRO.last.observed).toEqual([body]);
    expect(docEl.style.props['--dock-h']).toBeUndefined();
    stop();
  });

  it('tanpa ResizeObserver (SSR/jsdom tua) → null, tidak throw', () => {
    expect(watchDockHeight({ doc: mkDoc(170), roCls: null })).toBeNull();
    expect(watchDockHeight({ doc: null, roCls: FakeRO })).toBeNull();
  });

  it('cleanup: disconnect terpanggil sekali & pengukur mati', () => {
    const doc = mkDoc(170);
    const stop = watchDockHeight({ doc, roCls: FakeRO });
    expect(FakeRO.last.disconnected).toBe(false);
    stop();
    expect(FakeRO.last.disconnected).toBe(true);
    stop(); // idempoten — disconnect kedua tak throw
  });
});

describe('kontrak statis wiring (pola kontrak statis 176-183)', () => {
  const app = read('../App.jsx');
  const css = read('../index.css');

  it('App memasang watchDockHeight dgn cleanup (anti bocor observer)', () => {
    expect(app).toContain("import { watchDockHeight } from './lib/dock_h.js'");
    expect(app).toMatch(/const stop = watchDockHeight\(\)/);
    expect(app).toMatch(/if \(stop\) stop\(\)/);
  });

  it('CSS ≤560px memakai var --dock-h (bukan offset statis 148/200px lagi)', () => {
    expect(css).toMatch(/\.hud \{ bottom: calc\(var\(--dock-h, 130px\) \+ 28px \+ var\(--safe-b\)\); \}/);
    expect(css).toMatch(/\.toast \{ bottom: calc\(var\(--dock-h, 130px\) \+ 80px \+ var\(--safe-b\)\); \}/);
  });

  it('clamp max-height 120px SUDAH DIHAPUS dari blok dock mobile (akar bug)', () => {
    const block = css.slice(css.indexOf('@media (max-width: 560px)'));
    expect(block).not.toMatch(/\.dock \{[^}]*max-height:\s*120px/);
  });

  it('fallback CSS 130px konsisten dgn DOCK_H_MIN di lib', () => {
    expect(css).toContain('var(--dock-h, 130px)');
    expect(DOCK_H_MIN).toBe(130);
  });
});
