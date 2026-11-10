/**
 * Siklus 373 — satu sumber warna & label status task (UI React).
 *
 * Sebelumnya palet `done/running/review/failed/pending` tersalin 7× dengan
 * nilai yang SUDAH DRIFT diam-diam:
 *   failed : #ef4444 (TaskBoard/ProjectPanel) vs #FB7185 (ActivityLog/Ticker)
 *            vs #f66  (TeamStats/WfsPanel/Dashboard)
 *   review : #60A5FA (ActivityLog/Ticker/TeamStats) vs #448AFF (TaskBoard/ProjectPanel)
 *   pending: #9aa7b8 (TaskBoard) vs #9aa3b5 (ActivityLog/Ticker/TeamStats)
 *   failed di TeamStats #f66 bahkan LEBIH TERANG dari #ef4444 → chip "Gagal"
 *   di panel task dan di ticker log terlihat seperti dua status berbeda.
 *
 * Satu tabel kini memutuskan; semua komponen delegasi. Pilihan kanonik =
 * nilai var(--green)/chip review kanban yang sudah dipakai terbanyak:
 *   done #10E5A0 · running #F59E0B · review #60A5FA · failed #EF4444 ·
 *   pending #9AA7B8.
 *
 * Anti-poisoning: status non-string / tak dikenal → null (pemanggil memakai
 * fallback sendiri), bukan warna/label palsu.
 */
export const TASK_STATUS_COLORS = Object.freeze({
  done: '#10E5A0',
  running: '#F59E0B',
  review: '#60A5FA',
  failed: '#EF4444',
  pending: '#9AA7B8',
});

export const TASK_STATUS_LABELS = Object.freeze({
  done: 'Selesai',
  running: 'Jalan',
  review: 'Review',
  failed: 'Gagal',
  pending: 'Antri',
});

export function taskStatusColor(status) {
  if (typeof status !== 'string') return null;
  const c = TASK_STATUS_COLORS[status.toLowerCase()];
  return typeof c === 'string' ? c : null;
}

export function taskStatusLabel(status) {
  if (typeof status !== 'string') return null;
  const l = TASK_STATUS_LABELS[status.toLowerCase()];
  return typeof l === 'string' ? l : null;
}
