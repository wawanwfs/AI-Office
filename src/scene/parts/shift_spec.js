// Spesifikasi murni mesin fase shift WFS Project (diekstrak dari createShift di daycycle.js).
// Tanpa THREE, tanpa setTimeout, tanpa mutasi agentData — hanya keputusan fase & event.

// ── Konstanta historis shift ──
export const SHIFT = {
  DOOR: { x: -12, z: 8 },                 // pintu masuk/keluar kantor
  ARRIVE: [0, 2, 4, 1, 5, 3, 6, 7],       // urutan kedatangan agen (indeks)
  DEPART: [7, 6, 3, 5, 1, 4, 2, 0],       // urutan kepergian agen (kebalikan)
  ARRIVE_FROM: 480, ARRIVE_TO: 510,       // 08:00–08:30 → arriving
  LUNCH_START: 720, LUNCH_END: 780,       // 12:00–13:00 → lunch
  LEAVE_FROM: 1080, LEAVE_TO: 1110,       // 18:00–18:30 → leaving
  LUNCH_SPOT_X: -9.5, LUNCH_SPOT_Z: 9.0,  // depan bar stools (stools di z 8.5)
  LUNCH_SPOT_JITTER_X: 1.2, LUNCH_SPOT_JITTER_Z: 0.35,
  LUNCH_PAUSE_MIN: 6, LUNCH_PAUSE_MAX: 14,
};

export function lunchWindowOpen(m) {
  return m >= SHIFT.LUNCH_START && m < SHIFT.LUNCH_END;
}

// Titik berdiri saat lunch: jitter di depan bar stools, bukan di atasnya.
// r = objek rng dengan method r(min, max).
export function lunchSpot(r) {
  return {
    x: SHIFT.LUNCH_SPOT_X + r.r(-SHIFT.LUNCH_SPOT_JITTER_X, SHIFT.LUNCH_SPOT_JITTER_X),
    z: SHIFT.LUNCH_SPOT_Z + r.r(0, SHIFT.LUNCH_SPOT_JITTER_Z),
  };
}

// Timer ngopi (menit) untuk agen yang sedang lunch.
export function lunchPause(r) {
  return r.r(SHIFT.LUNCH_PAUSE_MIN, SHIFT.LUNCH_PAUSE_MAX);
}

// Mesin fase murni: dari state {phase, lunch} dan menit m, hasilkan fase baru
// dan daftar event berurutan yang harus dieksekusi createShift.
// Urutan event mengikuti update() historis: lunch → arrive → working → depart → nightfall → dawn.
export function shiftStep(state, m) {
  const events = [];
  let p = state.phase;
  let l = state.lunch;
  if (lunchWindowOpen(m) && !l) { l = true; events.push('lunch_start'); }
  else if (!lunchWindowOpen(m) && l) { l = false; events.push('lunch_end'); }
  // Event hanya saat ada perubahan (idempoten seperti update() historis).
  if (m >= SHIFT.ARRIVE_FROM && m <= SHIFT.ARRIVE_TO && p !== 'arriving' && p !== 'working') {
    p = 'arriving'; events.push('arrive');
  }
  if (m >= SHIFT.LUNCH_END && m < SHIFT.LEAVE_FROM) { if (p !== 'working') { p = 'working'; events.push('working_pm'); } }
  if (m >= SHIFT.LEAVE_FROM && m <= SHIFT.LEAVE_TO && p !== 'leaving') { p = 'leaving'; events.push('depart'); }
  if (m > SHIFT.LEAVE_TO || m < SHIFT.ARRIVE_FROM) { if (p !== 'night') { p = 'night'; events.push('nightfall'); } }
  // FIX BUG: dulu dawn() tereksekusi SETIAP malam (m>=480 & phase night) — termasuk
  // 18:31, tepat setelah nightfall → semua agen yang baru pulang langsung "hidup lagi"
  // duduk di meja (resurrection). Kini dawn hanya di jendela kedatangan 08:00–08:30.
  if (m >= SHIFT.ARRIVE_FROM && m <= SHIFT.ARRIVE_TO && p === 'night') { p = 'arriving'; events.push('dawn'); }
  if (m > SHIFT.ARRIVE_TO && m < SHIFT.LUNCH_START) { if (p !== 'working') { p = 'working'; events.push('working_am'); } }
  return { phase: p, lunch: l, events };
}
