/**
 * Siklus 361: satu sumber clamp 0..1 — pengganti salinan
 * `Math.max(0, Math.min(1, x))` di bubble_canvas, wall_fade, ring_spec,
 * sound_spec & sound_engine.
 *
 * ANTI-POISONING (tidak ada di salinan lama): null/undefined/NaN/±Infinity
 * dan string numerik dinormalisasi dulu; non-numerik → 0.
 * Output selalu number finite dalam [0, 1].
 */
export function clamp01(x) {
  const n = typeof x === 'number' ? x : Number(x)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Siklus 363: satu sumber clamp generik lo..hi — pengganti pola
 * `Math.max(lo, Math.min(hi, x))` di label_overlap (6 situs), zoom_spec,
 * kamera_focus, orbit_spec & kanban_drag.
 *
 * ANTI-POISONING: non-numerik/NaN/±Infinity → fallback (default lo).
 * bila lo > hi (salah urutan), lo & hi ditukar agar hasil tetap valid.
 * Output selalu number finite dalam [min(lo,hi), max(lo,hi)].
 */
export function clamp(x, lo, hi) {
  let n = typeof x === 'number' ? x : Number(x)
  let a = typeof lo === 'number' ? lo : Number(lo)
  let b = typeof hi === 'number' ? hi : Number(hi)
  if (Number.isNaN(n)) n = a
  if (Number.isNaN(a)) a = n
  if (Number.isNaN(b)) b = a
  if (a > b) { const t = a; a = b; b = t }
  return Math.min(b, Math.max(a, n))
}

/**
 * Siklus 364: satu sumber faktor damping eksponensial waktu-nyata —
 * pengganti pola `1 - Math.exp(-rate * dt)` di kamera_focus (focusStep),
 * ring_spec (ringDampFactor), bubbles (updateBubbles) & OfficeScene
 * (LBL_SMOOTH label relayout).
 *
 * ANTI-POISONING: rate/dt non-finite atau <= 0 → 0 (no-op, tidak bergerak);
 * hasil selalu number finite dalam [0, 1] (kenaikan monotonic dgn dt).
 */
export function expDamp(rate, dt) {
  const r = typeof rate === 'number' ? rate : Number(rate)
  const d = typeof dt === 'number' ? dt : Number(dt)
  if (!Number.isFinite(r) || !Number.isFinite(d) || r <= 0 || d <= 0) return 0
  return Math.min(1, Math.max(0, 1 - Math.exp(-r * d)))
}

/**
 * Siklus 362: satu sumber persen penyelesaian — pengganti salinan
 * `Math.round((x/y)*100)` di kanban_spec, team_spec, whiteboard_canvas,
 * whiteboard_spec & ProjectPanel (memakai pctDone dari sini via re-export).
 *
 * ANTI-POISONING: NaN/null/undefined/±Infinity → 0; total <= 0 → 0;
 * string numerik dinormalisasi; hasil di-clamp 0..100.
 */
export function pctDone(done, total) {
  const d = typeof done === 'number' ? done : Number(done)
  const t = typeof total === 'number' ? total : Number(total)
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((d / t) * 100)))
}
