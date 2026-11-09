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
