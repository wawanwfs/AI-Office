import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveShortcutAction,
  findShortcutByAction,
  KEYBOARD_SHORTCUTS,
  formatShortcutHelpSummary,
} from '../scene/parts/shortcut_spec.js';

// Siklus 179 — paritas tombol dgn tombol FOTO: shortcut keyboard "G" memicu
// snapshot PNG lewat jalur shortcut resmi (resolveShortcutAction → TAKE_SNAPSHOT
// → App delegasi handleSnapshot — SATU sumber yang sama dipakai tombol dock).
// Keputusan dokumentasi: G dianggap aman — TIDAK ada pengguna 'g' lain di
// resolveShortcutAction maupun modul lain (diperiksa), dan guard modal + guard
// mengetik (isEditableTarget) + guard ctrl/meta/alt berlaku otomatis via jalur
// resolveShortcutAction standar.

const __dir = join(dirname(fileURLToPath(import.meta.url)));
const __root = join(__dir, '../..'); // repo root (src/__tests__/.. = src, lalu ..)
const readSrc = (p) => readFileSync(join(__root, p), 'utf8');

const mkEvent = (key, extra = {}) => ({ key, target: {}, ...extra });

// ── Unit resolveShortcutAction ────────────────────────────────────────────────
describe('resolveShortcutAction — tombol G', () => {
  it('g → TAKE_SNAPSHOT', () => {
    expect(resolveShortcutAction(mkEvent('g'))).toEqual({ type: 'TAKE_SNAPSHOT' });
  });

  it('G (shift) → TAKE_SNAPSHOT juga (case-insensitive, pola semua huruf)', () => {
    expect(resolveShortcutAction(mkEvent('G', { shiftKey: true }))).toEqual({ type: 'TAKE_SNAPSHOT' });
  });

  it('guard modal: G saat modal terbuka → null (keyboard milik modal)', () => {
    expect(resolveShortcutAction(mkEvent('g'), { modalOpen: true, activeModal: null })).toBe(null);
  });

  it('guard mengetik: target input → null', () => {
    expect(resolveShortcutAction({ key: 'g', target: { tagName: 'INPUT' } })).toBe(null);
  });

  it('guard modifier: Ctrl/Meta/Alt+G → null (tidak membajak shortcut browser)', () => {
    expect(resolveShortcutAction(mkEvent('g', { ctrlKey: true }))).toBe(null);
    expect(resolveShortcutAction(mkEvent('g', { metaKey: true }))).toBe(null);
    expect(resolveShortcutAction(mkEvent('g', { altKey: true }))).toBe(null);
  });

  it('tidak ada konflik: pengguna "g" lain di shortcut table tetap 0 (satu tombol satu aksi)', () => {
    const gs = KEYBOARD_SHORTCUTS.filter(s => s.key === 'G');
    expect(gs.length).toBe(1);
    expect(gs[0].action).toBe('take_snapshot');
  });

  it('findShortcutByAction("take_snapshot") & ringkasan bantuan mencantumkan G', () => {
    const sc = findShortcutByAction('take_snapshot');
    expect(sc && sc.key).toBe('G');
    expect(sc && sc.category).toBe('tampilan');
    expect(formatShortcutHelpSummary()).toContain('G = foto kantor (PNG)');
  });
});

// ── Kontrak statis wiring ─────────────────────────────────────────────────────
describe('wiring statis — G terhubung ke satu sumber snapshot', () => {
  it('shortcut_spec: aksi "g" terdaftar di resolveShortcutAction', () => {
    const spec = readSrc('src/scene/parts/shortcut_spec.js');
    expect(spec).toMatch(/k === 'g'\)\s*return\s*\{\s*type:\s*'TAKE_SNAPSHOT'/);
  });

  it('App: TAKE_SNAPSHOT delegasi ke handleSnapshot (bukan logika inline duplikat)', () => {
    const app = readSrc('src/App.jsx');
    expect(app).toMatch(/actType === 'TAKE_SNAPSHOT'/);
    // Delegasi murni — tidak ada takeSnapshot/triggerSnapshotDownload lain
    // di dalam dispatch keyboard (satu sumber = handleSnapshot).
    const m = app.match(/actType === 'TAKE_SNAPSHOT'[\s\S]{0,300}?\} else if \(actType === 'ESCAPE'\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toContain('handleSnapshot()');
    expect(m[0]).not.toContain('triggerSnapshotDownload');
    expect(m[0]).not.toContain('.takeSnapshot()');
  });

  it('App: tombol FOTO & shortcut G sama-sama delegasi handleSnapshot (SATU sumber)', () => {
    const app = readSrc('src/App.jsx');
    // Sumber tunggal: handleSnapshot berisi seluruh logika
    expect(app).toMatch(/const handleSnapshot = useCallback/);
    expect(app).toMatch(/triggerSnapshotDownload\(r\)/);
    expect(app).toMatch(/Foto gagal: /);
    // Tombol dock delegasi — dulu (178) inline duplikat 8 baris
    expect(app).toMatch(/onSnapshot=\{\(\) => \{\s*\/\/[^\n]*\n[^\n]*handleSnapshot\(\)/);
    // handleSnapshot masuk deps useEffect keyboard (anti stale closure)
    expect(app).toMatch(/cycleAmbienceVolume, handleSnapshot\]\)/);
  });

  it('QuickToolbar: tombol FOTO tetap utuh (prop onSnapshot + IconCamera + aria)', () => {
    const ui = readSrc('src/components/QuickToolbar.jsx');
    expect(ui).toMatch(/onSnapshot && \(/);
    expect(ui).toMatch(/IconCamera/);
    expect(ui).toMatch(/aria-label="Simpan foto kantor"/);
  });
});
