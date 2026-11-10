/**
 * Siklus 393 — satu sumber warna aksen biru kantor (UI React + scene status).
 *
 * `#4D9FFF` (dan turunan rgba-nya) sebelumnya tersalin literal di 6 tempat
 * dengan potensi drift: fallback avatar AgentInspector (2×), kartu statistik
 * Dashboard (2×), status 'walk' di scene (agent_status.js), tombol audio
 * SettingsModal, dan highlight omniroute online di ProjectPanel. Ini bukan
 * warna status task — itu TASK_STATUS_COLORS — tapi aksen identitas kantor
 * (kartu agen berjalan, kartu jumlah Proyek/Agen, hover baris dashboard).
 *
 * Satu tabel kini memutuskan; pemakaian rgba memakai helper accentAlpha()
 * agar nilai 77,159,255 tak pernah diketik ulang (anti-drift).
 */

/** Aksen biru identitas kantor WFS (dipakai juga scene agent_status.walk). */
export const ACCENT_BLUE = '#4D9FFF';

/** rgb triplet ACCENT_BLUE, untuk interpolasi manual bila perlu. */
export const ACCENT_BLUE_RGB = '77,159,255';

/** rgb triplet failed #EF4444 (TASK_STATUS_COLORS.failed), untuk rgba. */
export const FAILED_RGB = '239,68,68';

/** rgba(alpha 0..1) di atas warna failed — komposisi satu sumber. */
export function failedAlpha(a) {
  const v = Number(a);
  if (!Number.isFinite(v) || v < 0 || v > 1) return null; // anti-poisoning
  return `rgba(${FAILED_RGB},${v})`;
}

/** rgba(alpha 0..1) di atas ACCENT_BLUE — satu titik kebenaran komposisi. */
export function accentAlpha(a) {
  const v = Number(a);
  if (!Number.isFinite(v) || v < 0 || v > 1) return null; // anti-poisoning
  return `rgba(${ACCENT_BLUE_RGB},${v})`;
}
