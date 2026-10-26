// Spesifikasi & Registri Shortcut Keyboard Global Kantor AI WFS
// Dipakai oleh App.jsx, OverlayHelp.jsx, TaskBoard.jsx, ProjectPanel.jsx, dsb.

export const SHORTCUT_CATEGORIES = {
  PANEL: { id: 'panel', label: 'Panel & Modal' },
  AUDIO: { id: 'audio', label: 'Audio & Ambience' },
  NAVIGASI: { id: 'navigasi', label: 'Navigasi Kamera & Lantai' },
  TAMPILAN: { id: 'tampilan', label: 'Tampilan & Estetika' },
};

export const KEYBOARD_SHORTCUTS = [
  { key: 'T', action: 'toggle_task_board', label: 'Papan Task (Kanban)', desc: 'Buka / tutup papan kanban & list task tim AI', category: 'panel' },
  { key: 'P', action: 'toggle_project_panel', label: 'Proyek dibantuin.com', desc: 'Buka / tutup ringkasan live proyek dibantuin.com', category: 'panel' },
  { key: 'L', action: 'toggle_log', label: 'Log Aktivitas', desc: 'Buka / tutup riwayat aktivitas kantor', category: 'panel' },
  { key: 'O', action: 'toggle_settings', label: 'Pengaturan Kantor', desc: 'Buka / tutup modal konfigurasi audio, visual & performa', category: 'panel' },
  { key: 'H', altKey: '?', action: 'toggle_help', label: 'Panduan Bantuan', desc: 'Buka / tutup dialog panduan interaktif', category: 'panel' },
  { key: 'M', action: 'toggle_mute', label: 'Mute Audio', desc: 'Bisu / aktifkan suara notifikasi master', category: 'audio' },
  { key: 'A', action: 'toggle_ambience', label: 'Ambience Hum', desc: 'Nyalakan / matikan suara latar HVAC dan drone kantor', category: 'audio' },
  { key: 'Shift+A', action: 'cycle_ambience_volume', label: 'Siklus Volume Ambience', desc: 'Ganti volume ambience preset (20% → 40% → 70% → 100%)', category: 'audio' },
  { key: '1 / 2 / 3', action: 'set_view', label: 'Sudut Kamera Preset', desc: 'Pilih sudut pandang Isometrik (1), Samping/Depan (2), atau Dari Atas (3)', category: 'navigasi' },
  { key: 'Shift+1/2/3', altKey: '[ / ]', action: 'focus_floor', label: 'Navigasi Lantai 1-3', desc: 'Fokus kamera langsung ke Lantai 1, 2, atau 3', category: 'navigasi' },
  { key: '0', action: 'reset_camera', label: 'Reset Kamera', desc: 'Kembalikan posisi & target kamera ke default isometrik', category: 'navigasi' },
  { key: '+ / −', action: 'zoom', label: 'Zoom In / Out', desc: 'Perbesar atau perkecil jarak pandang kamera 3D', category: 'navigasi' },
  { key: 'N', action: 'toggle_neon', label: 'Mode Neon / Cyberpunk', desc: 'Aktifkan estetika pencahayaan neon malam kantor', category: 'tampilan' },
  { key: 'K', action: 'toggle_names', label: 'Nama & Badge Agent', desc: 'Tampilkan / sembunyikan label nama 3D di atas agent', category: 'tampilan' },
  { key: 'R', action: 'toggle_rotate', label: 'Putar Otomatis', desc: 'Putar kamera 3D perlahan mengelilingi kantor', category: 'tampilan' },
  { key: 'F', action: 'toggle_fullscreen', label: 'Layar Penuh', desc: 'Beralih ke mode layar penuh browser', category: 'tampilan' },
  { key: 'Esc', action: 'escape', label: 'Tutup / Batal', desc: 'Tutup dialog / panel atau batalkan fokus seleksi agent', category: 'panel' },
];

export function getShortcutsByCategory(category) {
  if (!category || category === 'all') return KEYBOARD_SHORTCUTS;
  return KEYBOARD_SHORTCUTS.filter(s => s.category === category);
}

export function findShortcutByAction(action) {
  if (!action) return null;
  return KEYBOARD_SHORTCUTS.find(s => s.action === action) || null;
}

export function isEditableTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function getActiveModalType(flags = {}) {
  if (!flags) return null;
  if (flags.showSettings) return 'settings';
  if (flags.showHelp) return 'help';
  if (flags.showLog) return 'log';
  if (flags.isTaskBoardOpen) return 'task_board';
  if (flags.isProjectPanelOpen) return 'project_panel';
  return null;
}

export function resolveShortcutAction(event, context = {}) {
  if (!event || !event.key) return null;
  if (isEditableTarget(event.target)) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  const { modalOpen = false, activeModal = null } = context;
  const rawKey = event.key;
  const k = rawKey.toLowerCase();

  // Jika modal/dialog sedang terbuka: prioritaskan Escape dan toggle penutup modal aktif yang sesuai
  if (modalOpen) {
    if (k === 'escape') return { type: 'ESCAPE' };
    if (activeModal === 'task_board' && k === 't') return { type: 'TOGGLE_TASK_BOARD' };
    if (activeModal === 'project_panel' && k === 'p') return { type: 'TOGGLE_PROJECT_PANEL' };
    if (activeModal === 'help' && (k === 'h' || k === '?')) return { type: 'TOGGLE_HELP' };
    if (activeModal === 'settings' && k === 'o') return { type: 'TOGGLE_SETTINGS' };
    if (activeModal === 'log' && k === 'l') return { type: 'TOGGLE_LOG' };
    return null;
  }

  // Shift + combinations
  if (event.shiftKey) {
    if (k === 'a') return { type: 'CYCLE_AMBIENCE_VOLUME' };
    if (event.code === 'Digit1' || k === '!' || k === '1') return { type: 'FOCUS_FLOOR', floor: 1 };
    if (event.code === 'Digit2' || k === '@' || k === '2') return { type: 'FOCUS_FLOOR', floor: 2 };
    if (event.code === 'Digit3' || k === '#' || k === '3') return { type: 'FOCUS_FLOOR', floor: 3 };
  }

  // Standard keys
  if (k === 't') return { type: 'TOGGLE_TASK_BOARD' };
  if (k === 'p') return { type: 'TOGGLE_PROJECT_PANEL' };
  if (k === 'a') return { type: 'TOGGLE_AMBIENCE' };
  if (k === 'm') return { type: 'TOGGLE_MUTE' };
  if (k === 'o') return { type: 'TOGGLE_SETTINGS' };
  if (k === 'l') return { type: 'TOGGLE_LOG' };
  if (k === 'h' || k === '?') return { type: 'TOGGLE_HELP' };
  if (k === 'n') return { type: 'TOGGLE_NEON' };
  if (k === 'k') return { type: 'TOGGLE_NAMES' };
  if (k === 'r') return { type: 'TOGGLE_ROTATE' };
  if (k === 'f') return { type: 'TOGGLE_FULLSCREEN' };
  if (k === '[' || k === '{') return { type: 'CYCLE_FLOOR_PREV' };
  if (k === ']' || k === '}') return { type: 'CYCLE_FLOOR_NEXT' };
  if (k === '1') return { type: 'SET_VIEW', view: 'iso' };
  if (k === '2') return { type: 'SET_VIEW', view: 'front' };
  if (k === '3') return { type: 'SET_VIEW', view: 'top' };
  if (k === '0') return { type: 'RESET_CAMERA' };
  if (k === '+' || k === '=') return { type: 'ZOOM_IN' };
  if (k === '-') return { type: 'ZOOM_OUT' };
  if (k === 'escape') return { type: 'ESCAPE' };

  return null;
}

export function formatShortcutHelpSummary() {
  return [
    'T = papan task (Kanban)',
    'P = proyek dibantuin.com',
    'A = ambience hum (Shift+A volume)',
    'M = mute suara',
    'O = pengaturan kantor',
    'N = mode neon',
    'K = nama agent',
    'R = putar otomatis',
    'L = log aktivitas',
    'H = bantuan ini',
    '1 / 2 / 3 = kamera Iso/Depan/Atas',
    'Shift+1/2/3 atau [ / ] = navigasi Lantai 1-3',
    '0 = reset kamera',
    '+ / − = zoom',
    'F = fullscreen',
    'Esc = tutup panel.',
  ].join(' · ');
}
