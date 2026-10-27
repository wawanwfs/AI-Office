// Format durasi (detik) → teks ringkas "Xj Ym" / "Ym" / "—".
// Murni & anti-poisoning: input non-finite (NaN/±Infinity), bukan angka
// (null/undefined), atau string kosong → '—' fallback aman — konsisten dgn
// pola guard modul lain (motion_math/sim_clock/kamera_focus dll). Numerik
// string dinormalisasi ("90" → "1m"); teks non-angka → '—' (sebelumnya
// "NaNj NaNm" merambat ke HUD).
export function fmtUptime(s) {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (!Number.isFinite(n)) return '—';
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60);
  return h ? `${h}j ${m}m` : `${m}m`;
}
