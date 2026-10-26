// Perencanaan trip & pose langkah karakter — murni (tanpa THREE/DOM), bisa di-unit-test.
// Diekstrak dari motion.js: kecepatan, offset collab, jitter tujuan jalan-jalan,
// fallback koridor, dan pose stride (ayunan kaki/lengan + bob badan).
import { FRONT, bandOf } from './routing.js';

export const WALK_SPEED = 1.6;
export const EXIT_SPEED = 2.0;
export const LINE_SEC = 1.8; // durasi satu baris dialog percakapan (detik)

// Offset posisi berdiri menghampiri rekan (di samping kursi partner)
export const COLLAB_OFFSET = { x: 0.95, z: -0.15 };

// Rentang jitter tujuan jalan-jalan di sekitar titik dest
export const DEST_JITTER = 0.5;

// Pause di tujuan trip biasa: 2 + r(0,2) detik; duduk lagi: timer 6 + r(0,14)
export const TRIP_PAUSE_MIN = 2;
export const TRIP_PAUSE_JITTER = 2;
export const SIT_TIMER_MIN = 6;
export const SIT_TIMER_JITTER = 14;

// Peluang memilih collab dibanding jalan-jalan biasa
export const COLLAB_CHANCE = 0.75;

// Pose langkah (stride): t = performance.now()*TIME_SCALE, phase per-limb.
export const STRIDE = {
  TIME_SCALE: 0.01,
  LEG_POS: 0.08,   // posisi z kaki: sin(t+phase)*LEG_POS
  LEG_ROT: 0.25,   // rotasi x kaki: cos(t+phase)*LEG_ROT (ayunan ringan, aman dari menembus lantai)
  ARM_ROT: 0.5,    // rotasi x lengan: sin(t+phase)*ARM_ROT (berlawanan fase dgn kaki)
  BOB: 0.035,      // bob badan: |sin(t)|*BOB (naik-turun kecil 2x per siklus langkah)
};

export function collabTarget(home, off = COLLAB_OFFSET) {
  return { x: home.x + off.x, z: home.z + off.z };
}

export function jitterDest(dest, rng, jitter = DEST_JITTER) {
  return { x: dest.x + rng.r(-jitter, jitter), z: dest.z + rng.r(-jitter, jitter) };
}

// Pilih tujuan jalan-jalan bebas: maks `tries` percobaan; return null bila
// semua gagal (pemanggil menentukan fallback koridor).
export function pickDest(dests, rng, freeSpot, tries = 8) {
  if (!Array.isArray(dests) || dests.length === 0) return null;
  let spot = null;
  for (let i = 0; i < tries; i++) {
    const dest = dests[rng.i(0, dests.length - 1)];
    spot = jitterDest(dest, rng);
    if (freeSpot(spot.x, spot.z)) return spot;
  }
  return freeSpot(spot.x, spot.z) ? spot : null;
}

// Fallback koridor depan baris meja (band dari routing.js), clamp aman.
export function fallbackSpot(home) {
  const band = FRONT[Math.min(2, Math.max(0, bandOf(home.z)))];
  return { x: home.x, z: band };
}

// Pose stride pada waktu t (sudah dikali TIME_SCALE) dan fase limb.
// Kaki: posisi z + rotasi x; lengan: rotasi x (berlawanan fase); badan: bob.
export function stridePose(t, phase = 0) {
  return {
    legZ: Math.sin(t + phase) * STRIDE.LEG_POS,
    legRotX: Math.cos(t + phase) * STRIDE.LEG_ROT,
    armRotX: Math.sin(t + phase) * STRIDE.ARM_ROT,
    bob: Math.abs(Math.sin(t)) * STRIDE.BOB,
  };
}

// Pose istirahat (resetStride): semua limb kembali netral.
export const REST_POSE = { legZ: 0, legRotX: 0, armRotX: 0, bob: 0 };
