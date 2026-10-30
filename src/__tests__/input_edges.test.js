import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateFollowGoal } from '../scene/parts/kamera_focus.js';

// Siklus 176 — tepi input pointer & goal yatim (lanjutan audit jalur input
// kamera 174/175): (1) contextmenu kanvas dicegah (klik-kanan/long-press
// Android memunculkan menu browser di atas scene 3D); (2) pointerup tombol
// non-kiri bukan klik (dulu dihitung jalur raycast — kamera reset/fokus
// tanpa niat); (3) pointercancel mereset state gestur (dulu isDrag basi +
// prev basi → "drag hantu" setelah OS membatalkan pointer); (4) pointermove
// tanpa tombol (buttons=0) mematikan drag (tombol dilepas di luar window);
// (5) tombol Rumah di QuickToolbar = padanan mobile Escape (kontrak
// resetFocus scene — kamera balik overview + seleksi dihapus);
// (6) goal yatim (follow tanpa agen valid) → reset rumah (kontrak offsite),
// bukan no-op diam-diam (kamera beku menatap titik lama selamanya).

const HOME = { x: 0, y: 1.8, z: 0 };
const cloneHome = () => ({ ...HOME });

describe('updateFollowGoal — kontrak goal yatim diverifikasi (siklus 176)', () => {
  const mkGoal = (follow) => ({
    t: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    follow,
    r: 20,
  });

  // Catatan 176: percobaan mengubah goal yatim (follow tanpa agen valid) →
  // reset rumah DIBATALKAN — test follow_anchor (siklus 120) secara eksplisit
  // mengunci kontrak "goal dipertahankan" utk {meetIdx, root:null}, dan jalur
  // produksi tak pernah menghasilkannya (focusMeetingFigure selalu root valid).
  // Test di bawah MENEGAKKAN kontrak lama supaya keputusan ini terdokumentasi.
  it('goal yatim {meetIdx, root:null} → goal dipertahankan (kontrak 120, tidak diubah)', () => {
    const g = mkGoal({ meetIdx: 3, root: null });
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome });
    expect(out).toBe(g);
  });

  it('agen VALID tanpa anchor tetap dipertahankan (kontrak lama utk agen hidup)', () => {
    const g = mkGoal({ walker: { visible: false }, home: null, state: 'walking_out' });
    const out = updateFollowGoal(g, 30, 20);
    expect(out).toBe(g); // agen valid tapi belum punya anchor → goal tetap
  });

  it('offsite tetap reset ke rumah (kontrak inti tak tersentuh siklus 176)', () => {
    const g = mkGoal({ walker: { visible: true, position: { x: 1, z: 1 } }, state: 'offsite' });
    const out = updateFollowGoal(g, 30, 20, { clone: cloneHome });
    expect(out.reset).toBe(true);
    expect(out.t).toEqual(HOME);
  });
});

describe('sumber — kontrak statis tepi input pointer (siklus 176)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8');
  const toolbar = readFileSync(join(here, '../components/QuickToolbar.jsx'), 'utf8');
  const app = readFileSync(join(here, '../App.jsx'), 'utf8');

  it('contextmenu kanvas dicegah — menu browser tak muncul di atas scene', () => {
    expect(scene).toContain("__onCanvas('contextmenu',e=>e.preventDefault())");
  });

  it('pointercancel mereset SEMUA state gestur (drag + klik + touch)', () => {
    expect(scene).toContain("__onCanvas('pointercancel'");
    expect(scene).toContain('isDrag=false;downXY=null;__tapDown=null;dtapLast=null;');
    expect(scene).toContain('pinchDist=null;pinchActive=false;pinchGuard=false;');
  });

  it('pointerup tombol non-kiri bukan klik — downXY dibuang', () => {
    expect(scene).toContain("__onCanvas('pointerup',e=>{if(e.button!==0){downXY=null;e.preventDefault();}})");
  });

  it('pointermove tanpa tombol (buttons=0) mematikan drag — anti drag hantu', () => {
    expect(scene).toContain("__onCanvas('pointermove',e=>{if(e.buttons===0&&isDrag){isDrag=false;}})");
    // listener lama tetap utk pointer valid (drag putar)
    expect(scene).toContain("if(!isDrag||pinchActive)return");
  });

  it('klik-tengah dicegah di pointerdown — autoscroll Chrome tak menyala di scene', () => {
    expect(scene).toContain("__onCanvas('pointerdown',e=>{if(e.button===1)e.preventDefault();})");
  });

  it('tombol Rumah: padanan mobile Escape — delegasi resetFocus + hapus seleksi', () => {
    expect(toolbar).toContain('onGoHome');
    expect(toolbar).toContain('aria-label="Kembali ke tampilan awal"');
    expect(app).toContain('if (s && s.resetFocus) s.resetFocus()');
    expect(app).toContain('setSelectedAgent(null)');
  });
});
