// Matematika gerak karakter — murni (tanpa THREE/performance.now/DOM), bisa di-unit-test.
// Diekstrak dari motion.js: dist2, hard clamp batas dunia, langkah menuju target.

// Lantai: BoxGeometry(26, z 20) → ±13 / ±10. Dinding kiri x=-13, belakang z=-10.
// Pintu masuk kantor (spawn shift) di x=-12, z=8 → walker spawn 0.6 unit di dalam.
export const BOUNDS = { xMin: -15.9, xMax: 15.9, zMin: -12.4, zMax: 12.4 };

export const ARRIVE = 0.2;
// Siklus 274: langkah fisika maksimum per panggilan stepMove (detik). Delta
// frame di atas ini dipecah jadi beberapa sub-langkah di dalam stepMove.
export const STEP_MAX = 0.05;

// Selisih sudut terpendek (wrap ke [-π, π]) — dipakai interpolasi rotasi halus
// walker (slerp/lerp sudut terpendek) supaya tidak berputar memutar.
export function angleDelta(target, current) {
  // Guard anti-poisoning: input non-finite (NaN/±Infinity, mis. state rotasi
  // korup) TIDAK boleh menulari rotasi walker — kembalikan 0 (no-op) alih-alih
  // NaN yang akan membuat agent berhenti berputar/posisi absur.
  if (!Number.isFinite(target) || !Number.isFinite(current)) return 0;
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
// Siklus 274: sub-step — pemanggil boleh memberi delta frame besar (GPU
// lambat/SwiftShader 0.3 FPS → delta nyata bisa >2 s) tapi fisika per-langkah
// dibatasi STEP_MAX detik supaya kontrak "≤0.05 dtk per langkah" tetap
// terpenuhi DAN total jarak tempuh tetap proporsional delta penuh (dulu
// pemanggil OfficeScene meng-clamp 0.05 → jarak tempuh 0.3 FPS kacau).
export function stepMove(pos, target, speed, delta) {
  // Overload lama dipertahankan: delta ≤ STEP_MAX → perilaku & return identik.
  // Sub-step: fisika per langkah ≤ STEP_MAX detik (kontrak motion.js 20+);
  // langkah linier & stateless → jumlah sub-step hanya membagi, total identik.
  // Guard: delta non-finite (NaN/±Infinity) → jalur lama (dt→0, no-op aman,
  // tanpa loop); delta raksasa → sub-step di-cap 600 (dt proporsional) supaya
  // selalu terminasi (delta 4 dtk dari OfficeScene = hanya 80 sub-langkah).
  const steps = Number.isFinite(delta)
    ? Math.min(Math.max(1, Math.ceil(delta / STEP_MAX)), 600)
    : 1;
  if (steps > 1) {
    const dt = delta / steps;
    let cur = pos, res = null;
    for (let i = 0; i < steps; i++) {
      res = stepMove(cur, target, speed, dt);
      // Tiba di sub-langkah mana pun → SELESAI: sisa waktu dibuang (bukan
      // dibawa ke tujuan berikutnya — kontrak arrival per-target, dgn sisa
      // 9.8 dtk angka absur; dulu tanpa ini sisa delta bocor ke arrived=true).
      if (res.arrived) break;
      cur = { x: res.x, z: res.z, rot: res.rot };
    }
    return { x: res.x, z: res.z, rot: res.rot, arrived: res.arrived, clamped: res.clamped };
  }
  const { dx, dz, d } = dist2(pos, target);
  // Guard degenerat: jarak non-finite (NaN/±Infinity, mis. target korup) TIDAK
  // boleh menulari posisi walker (nx = dx/d → NaN → posisi jadi NaN & agent hilang).
  if (!Number.isFinite(d) || d < ARRIVE) {
    return { x: pos.x, z: pos.z, rot: pos.rot ?? 0, arrived: true, clamped: false };
  }
  // Guard anti-poisoning: speed/delta non-finite (NaN/±Infinity) → 0 (no-op aman).
  // Jangan biarkan NaN menulari posisi — nx*NaN*delta=NaN tidak kena clamp BOUNDS
  // (NaN < xMin false) sehingga walker bisa diam-diam lenyap ke NaN.
  const sp = Number.isFinite(speed) ? speed : 0;
  const dt = Number.isFinite(delta) ? delta : 0;
  const nx = dx / d, nz = dz / d;
  let x = pos.x + nx * sp * dt;
  let z = pos.z + nz * sp * dt;
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
