// parts/floor_elevation.js — Ketinggian Lantai Gedung Bertingkat 3 Lantai (Ground, Mezzanine, Penthouse)
// Bersifat murni tanpa dependensi THREE/DOM sehingga dapat diuji unit secara deterministik.

export const L1_Y = 0;       // Lantai 1: Datacenter, AI Lab & Tech Ops (Ground / Depan)
export const L2_Y = 0.60;    // Lantai 2: Core Engineering & Product Studio (Mid Mezzanine / Tengah)
export const L3_Y = 1.20;    // Lantai 3: Executive Penthouse & Lounge / Founder Suite (Belakang / Atas)

export const STAIR1_START_Z = -1.8;
export const STAIR1_END_Z = -0.6;
export const STAIR2_START_Z = 3.8;
export const STAIR2_END_Z = 5.0;

// Grand Staircase kembar di X = ±2.6 dengan lebar bentang 3.4m (radius 1.7m)
export const STAIR_WIDTH = 3.4;
export const isNearStairX = (x) => {
  if (x === undefined || x === null || !Number.isFinite(x)) return true;
  return Math.abs(Math.abs(x) - 2.6) <= STAIR_WIDTH / 2;
};

/**
 * Menghitung elevasi lantai vertikal Y (m) berdasarkan koordinat Z dan opsional X di kantor WFS.
 * Termasuk tanjakan tangga arsitektural L1→L2 dan L2→L3 secara presisi dan kontinu.
 * @param {number} z Koordinat sumbu Z di ruang 3D kantor
 * @param {number} [x] Koordinat sumbu X (opsional; bila tidak diberikan, diasumsikan di lintasan tangga)
 * @returns {number} Ketinggian permukaan lantai (meter)
 */
export function floorElevationAt(z, x) {
  // Guard anti-poisoning: z non-finite (NaN/±Infinity, mis. posisi walker korup)
  // TIDAK boleh mengangkat agen ke lantai atas (NaN menembus semua perbandingan →
  // jatuh ke return L3_Y). Kembalikan lantai dasar L1_Y (0) sebagai no-op aman,
  // konsisten dgn guard isNearStairX & pola anti-poisoning modul lain.
  if (!Number.isFinite(z)) return L1_Y;
  if (z <= STAIR1_START_Z) return L1_Y;
  if (z < STAIR1_END_Z) {
    if (!isNearStairX(x)) return L1_Y;
    const t = (z - STAIR1_START_Z) / (STAIR1_END_Z - STAIR1_START_Z);
    return L1_Y + t * (L2_Y - L1_Y);
  }
  if (z <= STAIR2_START_Z) return L2_Y;
  if (z < STAIR2_END_Z) {
    if (!isNearStairX(x)) return L2_Y;
    const t = (z - STAIR2_START_Z) / (STAIR2_END_Z - STAIR2_START_Z);
    return L2_Y + t * (L3_Y - L2_Y);
  }
  return L3_Y;
}
