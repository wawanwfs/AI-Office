// Siklus 185 — guard regresi DOCK WRAP UNIVERSAL + OFFSET ERA-EKSAK:
// konten dock 24 tombol berlabel terukur CDP ~1498px, tapi `.dock` global
// flex-wrap:nowrap → di laptop 1366/1440px (dan SEMUA ≤1519px: 600/680/760/
// 800/900/1000px terukur) tombol terakhir (Chat…Bantuan) berada DI LUAR
// viewport kanan — tak terlihat & tak bisa diklik. Dulu wrap hanya di ≤560px
// (184). Kini: wrap di semua lebar (viewport ≥1520px tetap satu baris persis
// seperti dulu — max-width aktif hanya saat muat tak cukup) + offset HUD/toast
// adaptif di 760px memakai var MENTAH --dock-h-raw (tanpa clamp 130px supaya
// dock 1 baris 85px → offset persis era nowrap: 88px, nol lompatan visual).
// Bonus bug tertutup: panel chat #wfs-panel kini bisa berada DI BAWAH HUD
// (z HUD 20 < z dock 25) → tombol header panel tertutup HUD; App kini ikut
// meng-inert .hud saat panel dock terbuka (chromeModal ATAU hudDockPanelOpen).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCK_H_MIN, DOCK_H_RAW_VAR, dockHRawValue } from '../lib/dock_h.js'

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

describe('dockHRawValue — transformasi mentah (tanpa clamp DOCK_H_MIN)', () => {
  it('nilai di bawah MIN tetap MENTAH (85 → "85px") — inti era-eksak', () => {
    expect(dockHRawValue(85)).toBe('85px');
  });
  it('ceil pecahan (84.6 → "85px")', () => {
    expect(dockHRawValue(84.6)).toBe('85px');
  });
  it('nilai besar ikut (184 → "184px")', () => {
    expect(dockHRawValue(184)).toBe('184px');
  });
  it('anti-poisoning: NaN/Infinity/0/negatif/string/null → null', () => {
    expect(dockHRawValue(NaN)).toBeNull();
    expect(dockHRawValue(Infinity)).toBeNull();
    expect(dockHRawValue(0)).toBeNull();
    expect(dockHRawValue(-5)).toBeNull();
    expect(dockHRawValue('85')).toBeNull();
    expect(dockHRawValue(null)).toBeNull();
  });
  it('beda dgn dockHValue di bawah MIN (clamp vs mentah)', () => {
    // dockHValue di-clamp ke DOCK_H_MIN; raw tidak.
    expect(DOCK_H_MIN).toBe(130);
  });
});

describe('kontrak statis index.css — dock wrap universal', () => {
  const css = read('../index.css');

  it('.dock GLOBAL memakai flex-wrap: wrap (bukan lagi nowrap implisit)', () => {
    const base = css.slice(css.indexOf('.dock {'), css.indexOf('}', css.indexOf('.dock {')));
    expect(base).toContain('flex-wrap: wrap');
    expect(base).toContain('justify-content: center');
  });

  it('TIDAK ada override flex-wrap lain (single source wrap global)', () => {
    // Semua .dock lain tidak boleh memaksa nowrap / wrap ulang.
    expect(css).not.toMatch(/\.dock\s*\{[^}]*flex-wrap:\s*nowrap/);
  });

  it('max-width tetap ada (wrap hanya aktif saat muat tak cukup — viewport lebar tetap 1 baris)', () => {
    const base = css.slice(css.indexOf('.dock {'), css.indexOf('}', css.indexOf('.dock {')));
    expect(base).toContain('max-width: calc(100vw - 20px)');
  });

  it('breakpoint 760px: HUD/toast offset memakai var mentah dgn fallback era-eksak', () => {
    expect(css).toMatch(/\.hud \{ top: auto !important; bottom: calc\(var\(--dock-h-raw, 85px\) \+ 3px \+ var\(--safe-b\)\)/);
    expect(css).toMatch(/\.toast \{ bottom: calc\(var\(--dock-h-raw, 87px\) \+ 3px \+ var\(--safe-b\)\)/);
  });

  it('offset statis 88px/140px SUDAH DIHAPUS dari breakpoint 760px (akar lompatan)', () => {
    const block = css.slice(css.indexOf('@media (max-width: 760px)'), css.indexOf('@media (max-width: 560px)'));
    expect(block).not.toContain('bottom: calc(88px + var(--safe-b))');
    expect(block).not.toContain('bottom: calc(140px + var(--safe-b))');
  });

  it('baris CSS mati .hud top:82px (kalah !important) DIHAPUS dari 760px', () => {
    const block = css.slice(css.indexOf('@media (max-width: 760px)'), css.indexOf('@media (max-width: 560px)'));
    expect(block).not.toMatch(/\.hud \{ top: 82px/);
  });

  it('≤560px tetap memakai var --dock-h (kontrak 184 tak diregresi)', () => {
    expect(css).toMatch(/\.hud \{ bottom: calc\(var\(--dock-h, 130px\) \+ 28px \+ var\(--safe-b\)\); \}/);
    expect(css).toMatch(/\.toast \{ bottom: calc\(var\(--dock-h, 130px\) \+ 80px \+ var\(--safe-b\)\); \}/);
  });
});

describe('kontrak statis lib — var mentah ditulis serempak dgn var clamp', () => {
  const lib = read('../lib/dock_h.js');

  it('setDockHVar menulis DOCK_H_RAW_VAR sebelum DOCK_H_VAR (satu pemanggilan ukur)', () => {
    expect(lib).toContain("export const DOCK_H_RAW_VAR = '--dock-h-raw'");
    const setFn = lib.slice(lib.indexOf('export function setDockHVar'), lib.indexOf('watchDockHeight'));
    expect(setFn.indexOf('DOCK_H_RAW_VAR')).toBeGreaterThan(-1);
    expect(setFn.indexOf('DOCK_H_VAR')).toBeGreaterThan(setFn.indexOf('DOCK_H_RAW_VAR'));
  });

  it('watchDockHeight tak berubah perilaku: rect height (bukan clientHeight)', () => {
    expect(lib).toMatch(/getBoundingClientRect\(\)\.height/);
    expect(lib).not.toMatch(/position\.y = .*clientHeight/);
  });
});

describe('kontrak statis App.jsx — HUD ikut di-inert saat panel dock terbuka', () => {
  const app = read('../App.jsx');

  it('hudDockPanelOpen dihitung dari .dock .panel visible (position fixed + rects)', () => {
    expect(app).toMatch(/const hudDockPanelOpen = Array\.from\(document\.querySelectorAll\('\.dock \.panel'\)\)/);
    expect(app).toContain("getComputedStyle(p).position === 'fixed'");
    expect(app).toContain('p.getClientRects().length > 0');
  });

  it('selector inert: chromeModal || hudDockPanelOpen → header, .hud, .ticker (dulu tanpa kondisi)', () => {
    expect(app).toMatch(/chromeModal \|\| hudDockPanelOpen \? 'header, \.hud, \.ticker' : 'header, \.ticker'/);
  });

  it('deps effect menyertakan hudDockPanelOpen (re-run saat panel buka/tutup)', () => {
    expect(app).toMatch(/\}, \[chromeModal, hudDockPanelOpen\]\)/);
  });

  it('rumus modalActive & wfsSetAppModalBase TIDAK berubah (kontrak 180/181 utk flag shortcut)', () => {
    // hudDockPanelOpen sengaja TIDAK masuk flag modal — panel memang modal sah
    // via useModalFlag (count); menambahkannya = dobel & merusak exception C.
    expect(app).toMatch(/wfsSetAppModalBase\(!!\(showTask \|\| confirm \|\| ask \|\| showHelp \|\| showSettings \|\| showLog \|\| selectedAgent\)\)/);
    expect(app).not.toMatch(/wfsSetAppModalBase\([^)]*hudDockPanelOpen/);
  });
});
