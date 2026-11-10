// office_hours.js — SATU sumber jam kegiatan kantor (siklus 372).
// Dulu jam-jadwal tersebar 3 modul yang saling asing:
//   - daycycle.SCHEDULE      : 600 'Stand-up pagi', 720 'Istirahat makan siang',
//                              840 'Sprint review' (label fase HUD)
//   - meeting.MEETING_WINDOWS: [[600,630],[840,870]] (peserta rapat scene)
//   - shift_spec.SHIFT       : LUNCH_START 720 / LUNCH_END 780 (trip makan siang)
// Risiko drift nyata: mengubah jam stand-up di SCHEDULE tidak otomatis menggeser
// jendela rapat di MEETING_WINDOWS → chip HUD bilang "Stand-up pagi" tapi ruang
// meeting kosong (atau sebaliknya). Kini ketiganya menurun dari tabel di sini.
//
// Anti-poisoning: setiap jendela dinormalisasi (a>b ditukar; non-finite → null)
// dan pembanding jendela menolak input non-finite (false, bukan NaN-kontaminasi).

/** Jendela rapat tim (menit sejak 00:00): stand-up 10:00–10:30, sprint review 14:00–14:30. */
export const MEETING_WINDOWS = [
  { start: 600, end: 630, label: 'Stand-up pagi' },
  { start: 840, end: 870, label: 'Sprint review' },
];

/** Jendela makan siang 12:00–13:00. */
export const LUNCH_START = 720;
export const LUNCH_END = 780;
export const LUNCH_LABEL = 'Istirahat makan siang';

/** Fase dasar (di luar jendela rapat & lunch) — satu tabel berurut. */
export const BASE_PHASES = [
  { at: 0, label: 'Shift malam · WFS online' },
  { at: 360, label: 'Persiapan pagi' },
  { at: 480, label: 'Tim mulai berdatangan' },
  { at: 540, label: 'Fokus pagi' },
  { at: 630, label: 'Deep work · semua online' },
  { at: 780, label: 'Fokus siang' },
  { at: 870, label: 'Fokus sore' },
  { at: 1020, label: 'Tim bersiap pulang' },
  { at: 1140, label: 'Shift malam · WFS online' },
];

/** Label fase pada menit m: jendela rapat → label jendela; lunch → label lunch;
 * sisanya fase dasar terakhir. Non-finite → null (pemanggil memutuskan fallback). */
export function officeStatusAt(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return null;
  for (const w of MEETING_WINDOWS) if (m >= w.start && m <= w.end) return w.label;
  if (m >= LUNCH_START && m < LUNCH_END) return LUNCH_LABEL;
  let label = BASE_PHASES[0].label;
  for (const p of BASE_PHASES) if (m >= p.at) label = p.label;
  return label;
}

/** Jadwal lengkap gaya daycycle lama: batas semua fase (jendela + lunch + base)
 * dipetakan ke labelnya — 12 entri berurut naik, siklus 24 jam tertutup. */
export function scheduleTable() {
  const ats = new Set(BASE_PHASES.map((p) => p.at));
  for (const w of MEETING_WINDOWS) ats.add(w.start);
  ats.add(LUNCH_START);
  return [...ats].sort((a, b) => a - b).map((at) => [at, officeStatusAt(at)]);
}

/** Apakah m di salah satu jendela rapat? Non-finite → false (paritas lama). */
export function isMeetingTime(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return false;
  return MEETING_WINDOWS.some((w) => m >= w.start && m <= w.end);
}

/** Indeks jendela rapat yang berisi m, atau -1. Non-finite → -1 (paritas lama). */
export function meetingWindowIndex(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return -1;
  return MEETING_WINDOWS.findIndex((w) => m >= w.start && m <= w.end);
}

/** Normalisasi jendela: non-finite → null; start>end ditukar. */
function normWin(w) {
  if (!w || typeof w !== 'object') return null;
  const s = typeof w.start === 'number' ? w.start : Number(w.start);
  const e = typeof w.end === 'number' ? w.end : Number(w.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

/** minutes di dalam jendela [start, end]? Non-finite → false (bukan NaN-leak). */
export function inWindow(minutes, win) {
  const m = typeof minutes === 'number' ? minutes : Number(minutes);
  const w = normWin(win);
  if (!Number.isFinite(m) || !w) return false;
  return m >= w.start && m <= w.end;
}
