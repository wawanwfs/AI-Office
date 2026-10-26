// Matematika gerak karakter — murni (tanpa THREE/performance.now/DOM), bisa di-unit-test.
// Diekstrak dari motion.js: dist2, hard clamp batas dunia, langkah menuju target.

// Lantai: BoxGeometry(26, z 20) → ±13 / ±10. Dinding kiri x=-13, belakang z=-10.
// Pintu masuk kantor (spawn shift) di x=-12, z=8 → walker spawn 0.6 unit di dalam.
export const BOUNDS = { xMin: -15.9, xMax: 15.9, zMin: -12.4, zMax: 12.4 };

export const ARRIVE = 0.2;

// Selisih sudut terpendek (wrap ke [-π, π]) — dipakai interpolasi rotasi halus
// walker (slerp/lerp sudut terpendek) supaya tidak berputar memutar.
export function angleDelta(target, current) {
  // Normalisasi O(1) ke [-π, π): selisih terpendek tanpa loop (loop lama bisa
  // berputar jutaan kali untuk selisih sangat besar — mis. angleDelta(1e9, 0)).
  const d = (target - current + Math.PI) % (Math.PI * 2);
  return ((d + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

export function dist2(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return { dx, dz, d: Math.hypot(dx, dz) };
}

// Satu langkah menuju target. Return { x, z, rot, arrived, clamped }.
// rot = arah hadap (atan2(dx, dz)) ATAU posisi sebelumnya bila sudah tiba/clamp-total.
export function stepMove(pos, target, speed, delta) {
  const { dx, dz, d } = dist2(pos, target);
  // Guard degenerat: jarak non-finite (NaN/±Infinity, mis. target korup) TIDAK
  // boleh menulari posisi walker (nx = dx/d → NaN → posisi jadi NaN & agent hilang).
  if (!Number.isFinite(d) || d < ARRIVE) {
    return { x: pos.x, z: pos.z, rot: pos.rot ?? 0, arrived: true, clamped: false };
  }
  const nx = dx / d, nz = dz / d;
  let x = pos.x + nx * speed * delta;
  let z = pos.z + nz * speed * delta;
  // hard clamp: tanpa ini agent bisa keluar lantai/dinding (spawn DOOR.x=-12
  // di luar BOUNDS dulu, atau walkTarget acak dekat tepi) — dilihat dari
  // luar kantor tampak menembus dinding kiri.
  let clamped = false;
  if (x < BOUNDS.xMin) { x = BOUNDS.xMin; clamped = true; }
  if (x > BOUNDS.xMax) { x = BOUNDS.xMax; clamped = true; }
  if (z < BOUNDS.zMin) { z = BOUNDS.zMin; clamped = true; }
  if (z > BOUNDS.zMax) { z = BOUNDS.zMax; clamped = true; }
  const rot = Math.atan2(nx, nz);
  return { x, z, rot, arrived: false, clamped };
}
