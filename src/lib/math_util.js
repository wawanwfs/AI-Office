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
