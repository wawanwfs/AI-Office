import { describe, it, expect } from 'vitest';
import {
  SHORTCUT_CATEGORIES,
  KEYBOARD_SHORTCUTS,
  getShortcutsByCategory,
  findShortcutByAction,
  isEditableTarget,
  getActiveModalType,
  resolveShortcutAction,
  formatShortcutHelpSummary,
} from '../scene/parts/shortcut_spec';

describe('shortcut_spec — Spesifikasi Keyboard Shortcut Global', () => {
  it('registri SHORTCUT_CATEGORIES memiliki kategori panel, audio, navigasi, dan tampilan', () => {
    expect(SHORTCUT_CATEGORIES.PANEL.id).toBe('panel');
    expect(SHORTCUT_CATEGORIES.AUDIO.id).toBe('audio');
    expect(SHORTCUT_CATEGORIES.NAVIGASI.id).toBe('navigasi');
    expect(SHORTCUT_CATEGORIES.TAMPILAN.id).toBe('tampilan');
  });

  it('KEYBOARD_SHORTCUTS mendaftarkan shortcut utama (T, P, A, Shift+A, M, O, L, H, dsb.)', () => {
    const keys = KEYBOARD_SHORTCUTS.map(s => s.key);
    expect(keys).toContain('T');
    expect(keys).toContain('P');
    expect(keys).toContain('A');
    expect(keys).toContain('Shift+A');
    expect(keys).toContain('M');
    expect(keys).toContain('O');
    expect(keys).toContain('L');
    expect(keys).toContain('H');
    expect(keys).toContain('N');
    expect(keys).toContain('K');
    expect(keys).toContain('R');
    expect(keys).toContain('F');
    expect(keys).toContain('Esc');
  });

  it('getShortcutsByCategory memfilter shortcut sesuai kategori atau mengembalikan semua', () => {
    const audioShortcuts = getShortcutsByCategory('audio');
    expect(audioShortcuts.length).toBeGreaterThanOrEqual(3);
    expect(audioShortcuts.every(s => s.category === 'audio')).toBe(true);

    const all = getShortcutsByCategory('all');
    expect(all.length).toBe(KEYBOARD_SHORTCUTS.length);
  });

  it('findShortcutByAction menemukan item berdasarkan identifier aksi', () => {
    expect(findShortcutByAction('toggle_task_board')?.key).toBe('T');
    expect(findShortcutByAction('toggle_project_panel')?.key).toBe('P');
    expect(findShortcutByAction('toggle_ambience')?.key).toBe('A');
    expect(findShortcutByAction('cycle_ambience_volume')?.key).toBe('Shift+A');
    expect(findShortcutByAction('unknown')).toBeNull();
  });

  it('isEditableTarget mendeteksi input, textarea, select, dan contentEditable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('resolveShortcutAction mengabaikan input editable dan tombol modifier (ctrl/meta/alt)', () => {
    expect(resolveShortcutAction({ key: 't', target: { tagName: 'INPUT' } })).toBeNull();
    expect(resolveShortcutAction({ key: 't', ctrlKey: true })).toBeNull();
    expect(resolveShortcutAction({ key: 't', metaKey: true })).toBeNull();
    expect(resolveShortcutAction({ key: 't', altKey: true })).toBeNull();
    expect(resolveShortcutAction(null)).toBeNull();
  });

  it('resolveShortcutAction saat modal terbuka: hanya merespon Escape, menolak shortcut biasa', () => {
    expect(resolveShortcutAction({ key: 'Escape' }, { modalOpen: true })).toEqual({ type: 'ESCAPE' });
    expect(resolveShortcutAction({ key: 't' }, { modalOpen: true })).toBeNull();
    expect(resolveShortcutAction({ key: 'a' }, { modalOpen: true })).toBeNull();
    expect(resolveShortcutAction({ key: 'm' }, { modalOpen: true })).toBeNull();
  });

  it('getActiveModalType mendeteksi jenis modal yang sedang aktif', () => {
    expect(getActiveModalType({ showSettings: true })).toBe('settings');
    expect(getActiveModalType({ showHelp: true })).toBe('help');
    expect(getActiveModalType({ showLog: true })).toBe('log');
    expect(getActiveModalType({ isTaskBoardOpen: true })).toBe('task_board');
    expect(getActiveModalType({ isProjectPanelOpen: true })).toBe('project_panel');
    expect(getActiveModalType({})).toBeNull();
    expect(getActiveModalType(null)).toBeNull();
  });

  it('resolveShortcutAction saat activeModal spesifik: mengizinkan shortcut toggle penutup modal bersangkutan', () => {
    expect(resolveShortcutAction({ key: 't' }, { modalOpen: true, activeModal: 'task_board' })).toEqual({ type: 'TOGGLE_TASK_BOARD' });
    expect(resolveShortcutAction({ key: 'T' }, { modalOpen: true, activeModal: 'task_board' })).toEqual({ type: 'TOGGLE_TASK_BOARD' });
    expect(resolveShortcutAction({ key: 'p' }, { modalOpen: true, activeModal: 'project_panel' })).toEqual({ type: 'TOGGLE_PROJECT_PANEL' });
    expect(resolveShortcutAction({ key: 'h' }, { modalOpen: true, activeModal: 'help' })).toEqual({ type: 'TOGGLE_HELP' });
    expect(resolveShortcutAction({ key: '?' }, { modalOpen: true, activeModal: 'help' })).toEqual({ type: 'TOGGLE_HELP' });
    expect(resolveShortcutAction({ key: 'o' }, { modalOpen: true, activeModal: 'settings' })).toEqual({ type: 'TOGGLE_SETTINGS' });
    expect(resolveShortcutAction({ key: 'l' }, { modalOpen: true, activeModal: 'log' })).toEqual({ type: 'TOGGLE_LOG' });

    // Shortcut tidak sesuai tetap ditolak
    expect(resolveShortcutAction({ key: 'p' }, { modalOpen: true, activeModal: 'task_board' })).toBeNull();
    expect(resolveShortcutAction({ key: 'a' }, { modalOpen: true, activeModal: 'task_board' })).toBeNull();
    expect(resolveShortcutAction({ key: '1' }, { modalOpen: true, activeModal: 'task_board' })).toBeNull();
  });

  it('resolveShortcutAction memetakan shortcut panel (T, P, L, O, H/?, Esc)', () => {
    expect(resolveShortcutAction({ key: 't' })).toEqual({ type: 'TOGGLE_TASK_BOARD' });
    expect(resolveShortcutAction({ key: 'T' })).toEqual({ type: 'TOGGLE_TASK_BOARD' });
    expect(resolveShortcutAction({ key: 'p' })).toEqual({ type: 'TOGGLE_PROJECT_PANEL' });
    expect(resolveShortcutAction({ key: 'P' })).toEqual({ type: 'TOGGLE_PROJECT_PANEL' });
    expect(resolveShortcutAction({ key: 'l' })).toEqual({ type: 'TOGGLE_LOG' });
    expect(resolveShortcutAction({ key: 'o' })).toEqual({ type: 'TOGGLE_SETTINGS' });
    expect(resolveShortcutAction({ key: 'h' })).toEqual({ type: 'TOGGLE_HELP' });
    expect(resolveShortcutAction({ key: '?' })).toEqual({ type: 'TOGGLE_HELP' });
    expect(resolveShortcutAction({ key: 'Escape' })).toEqual({ type: 'ESCAPE' });
  });

  it('resolveShortcutAction memetakan audio & ambience (A, Shift+A, M)', () => {
    expect(resolveShortcutAction({ key: 'a' })).toEqual({ type: 'TOGGLE_AMBIENCE' });
    expect(resolveShortcutAction({ key: 'A', shiftKey: true })).toEqual({ type: 'CYCLE_AMBIENCE_VOLUME' });
    expect(resolveShortcutAction({ key: 'm' })).toEqual({ type: 'TOGGLE_MUTE' });
  });

  it('resolveShortcutAction memetakan navigasi lantai dan kamera (1/2/3, Shift+1/2/3, [, ], 0, +, -)', () => {
    expect(resolveShortcutAction({ key: '1' })).toEqual({ type: 'SET_VIEW', view: 'iso' });
    expect(resolveShortcutAction({ key: '2' })).toEqual({ type: 'SET_VIEW', view: 'front' });
    expect(resolveShortcutAction({ key: '3' })).toEqual({ type: 'SET_VIEW', view: 'top' });
    expect(resolveShortcutAction({ key: '!', shiftKey: true, code: 'Digit1' })).toEqual({ type: 'FOCUS_FLOOR', floor: 1 });
    expect(resolveShortcutAction({ key: '@', shiftKey: true, code: 'Digit2' })).toEqual({ type: 'FOCUS_FLOOR', floor: 2 });
    expect(resolveShortcutAction({ key: '#', shiftKey: true, code: 'Digit3' })).toEqual({ type: 'FOCUS_FLOOR', floor: 3 });
    expect(resolveShortcutAction({ key: '[' })).toEqual({ type: 'CYCLE_FLOOR_PREV' });
    expect(resolveShortcutAction({ key: ']' })).toEqual({ type: 'CYCLE_FLOOR_NEXT' });
    expect(resolveShortcutAction({ key: '0' })).toEqual({ type: 'RESET_CAMERA' });
    expect(resolveShortcutAction({ key: '+' })).toEqual({ type: 'ZOOM_IN' });
    expect(resolveShortcutAction({ key: '=' })).toEqual({ type: 'ZOOM_IN' });
    expect(resolveShortcutAction({ key: '-' })).toEqual({ type: 'ZOOM_OUT' });
  });

  it('resolveShortcutAction memetakan tampilan (N, K, R, F)', () => {
    expect(resolveShortcutAction({ key: 'n' })).toEqual({ type: 'TOGGLE_NEON' });
    expect(resolveShortcutAction({ key: 'k' })).toEqual({ type: 'TOGGLE_NAMES' });
    expect(resolveShortcutAction({ key: 'r' })).toEqual({ type: 'TOGGLE_ROTATE' });
    expect(resolveShortcutAction({ key: 'f' })).toEqual({ type: 'TOGGLE_FULLSCREEN' });
  });

  it('resolveShortcutAction memetakan siklus preset divisi (D maju, Shift+D mundur, aktif saat task_board terbuka)', () => {
    // Di luar modal: D maju, Shift+D mundur
    expect(resolveShortcutAction({ key: 'd' })).toEqual({ type: 'CYCLE_DIV_PRESET' });
    expect(resolveShortcutAction({ key: 'D' })).toEqual({ type: 'CYCLE_DIV_PRESET' });
    expect(resolveShortcutAction({ key: 'D', shiftKey: true })).toEqual({ type: 'CYCLE_DIV_PRESET_BACKWARD' });
    // Saat task board terbuka (modal): D tetap bisa menyiklus preset
    expect(resolveShortcutAction({ key: 'd' }, { modalOpen: true, activeModal: 'task_board' })).toEqual({ type: 'CYCLE_DIV_PRESET' });
    // Modal lain: tidak diizinkan
    expect(resolveShortcutAction({ key: 'd' }, { modalOpen: true, activeModal: 'project_panel' })).toBeNull();
    // Registri & ringkasan bantuan memuat shortcut baru
    expect(findShortcutByAction('cycle_div_preset')?.key).toBe('D');
    expect(formatShortcutHelpSummary()).toContain('D = siklus preset divisi');
  });

  it('formatShortcutHelpSummary menghasilkan string ringkasan yang mencakup fitur baru', () => {
    const summary = formatShortcutHelpSummary();
    expect(summary).toContain('T = papan task (Kanban)');
    expect(summary).toContain('P = proyek dibantuin.com');
    expect(summary).toContain('A = ambience hum');
    expect(summary).toContain('M = mute suara');
  });
});
