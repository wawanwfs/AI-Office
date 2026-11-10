/**
 * Siklus 366: satu sumber RNG deterministik (LCG Lehmer, seed tetap) —
 * pengganti kelas RNG inline di OfficeScene.js (dipakai via ctx.rng oleh
 * parts: furniture, bookshelf, effects, daycycle, motion, trip_plan, dll).
 *
 * Urutan angka HARUS identik dengan implementasi lama (seed 2026) supaya
 * layout acak scene (daun tanaman, buku, partikel) tidak berubah visual.
 *
 * ANTI-POISONING (tidak ada di salinan lama):
 * - seed non-finite/<=0 → seed default 42 (perilaku class lama s=42).
 * - r(a,b): a/b non-finite → 0; b < a ditukar (hasil selalu dalam rentang).
 * - pick(array) kosong/bukan array → undefined (pemanggil cek), indeks
 *   selalu integer valid 0..len-1.
 */
export const RNG_DEFAULT_SEED = 42;

export class DetRNG {
  constructor(seed = RNG_DEFAULT_SEED) {
    let s = typeof seed === 'number' ? seed : Number(seed);
    if (!Number.isFinite(s) || s <= 0 || !Number.isInteger(s)) s = RNG_DEFAULT_SEED;
    this.s = s;
  }
  /** Uniform [0, 1) — LCG Lehmer 16807, state 1..M-1. */
  n() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  /** Uniform [a, b]; a/b non-finite → 0; b < a ditukar. */
  r(a, b) {
    let x = typeof a === 'number' ? a : Number(a);
    let y = typeof b === 'number' ? b : Number(b);
    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;
    if (y < x) { const t = x; x = y; y = t; }
    return x + this.n() * (y - x);
  }
  /** Integer inklusif [a, b]. */
  i(a, b) {
    return Math.floor(this.r(a, b + 1));
  }
  /** Elemen acak array; array kosong/bukan array → undefined. */
  pick(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr[this.i(0, arr.length - 1)];
  }
}

/** Instance scene dengan seed produksi (paritas dengan RNG(2026) lama). */
export const sceneRng = new DetRNG(2026);
