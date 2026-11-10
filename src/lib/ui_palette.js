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

/**
 * Siklus 396 — warna teks sekunder/muted UI (satu sumber).
 *
 * `#8fa2c4` sebelumnya diketik literal 20× di ShConsole (placeholder kosong,
 * meta task/agent, hint branch, status muat). Bukan warna status task —
 * teks redup netral kebiruan. Satu titik kebenaran di sini.
 */
export const MUTED_TEXT = '#8fa2c4';

/** Ikon/tombol sky terang (tombol uji audio) — sebelumnya literal #38bdf8. */
export const SKY_BUTTON = '#38bdf8';

/**
 * Siklus 398 — warna kartu statistik Dashboard tersisa (satu sumber).
 *
 * `#8B5CF6` (violet, kartu "Task") sebelumnya literal di Dashboard dan
 * duplikat hex identik di agents_spec (TRAINER AI — identitas karakter,
 * tetap di spec agen). `#ADDBF2` (biru muda, kartu "File dihasilkan")
 * juga literal. Keduanya bukan warna status task — aksen kartu.
 */
export const VIOLET_CARD = '#8B5CF6';
export const PALE_BLUE_CARD = '#ADDBF2';

/**
 * Siklus 399 — amber aksen kanvas scene (satu sumber).
 *
 * `#F59E0B` sebelumnya literal di 3 painter kanvas: TV lounge (header
 * 'WFS HQ · LIVE' + badge SINKRON/stale), border label zona, dan judul
 * whiteboard sprint. Bukan warna status task (running kanonik) — aksen
 * brand amber identitas kantor di kanvas.
 */
export const AMBER_ACCENT = '#F59E0B';

/**
 * Siklus 400 — cyan neon & violet statistik (satu sumber).
 *
 * `#00F0FF` (cyan neon) sebelumnya literal di FloorNavigator (warna L2),
 * ikon moon QuickToolbar, plakat LEVEL 02 terraces, dan LED neon. Bukan
 * warna status task — aksen neon identitas lantai 2. `#A78BFA` (violet)
 * sebelumnya literal di Ticker (baris Host RAM) — aksen teks statistik.
 * Identitas karakter agen (extended_desks/agents_spec) tetap di spec.
 */
export const CYAN_NEON = '#00F0FF';

/**
 * Siklus 401 — hijau aksen kanvas scene (satu sumber).
 *
 * `#10E5A0` sebelumnya literal di plakat LEVEL 03 terraces. Sama hex dengan
 * status kananik task done (TASK_STATUS_COLORS.done / agent_status.work) —
 * delegasi aksen plakat tetap via ui_palette agar evolusi terpisah bisa
 * dilakukan (pola sama dengan AMBER_ACCENT siklus 399).
 */
export const GREEN_ACCENT = '#10E5A0';
export const VIOLET_STATS = '#A78BFA';

/**
 * Cyan default divisi/preset TaskBoard (#38BDF8, sky blue) — siklus 402.
 * Fallback warna divisi aktif & warna awal form pembuat preset/divisi.
 */
export const SKY_DIVISION = '#38BDF8';

/**
 * Siklus 403 — palet teks ShConsole (satu sumber).
 *
 * `#eaf1ff` (teks terang, nilai/nama/input) sebelumnya literal 6× di
 * ShConsole.jsx. Bukan warna status task — teks utama panel konsol.
 */
export const BRIGHT_TEXT = '#eaf1ff';

// Abu-abu redup untuk meta kecil (timestamp, sumber log, badge stream).
export const FAINT_META = '#5f6f90';
