// Tujuan jalan-jalan agent (pilih saat walking_out tanpa kolaborasi):
// pantry, dispenser, printer, lounge, ruang meeting, resepsionis, jalur tengah, tanaman.
// Diekstrak murni agar bisa di-unit-test; dipakai motion.js via createMotion ctx.
export const WALK_DESTINATIONS = [
  { x: -9.4, z: 3.6 },   // pantry
  { x: -9.5, z: 0.9 },   // dispenser air
  { x: 2.2, z: -7.0 },   // printer
  { x: 9.0, z: 3.9 },    // lounge (9.4,4.8 lama = DI DALAM footprint sofa; digeser ke tepi bebas)
  { x: 6.0, z: -0.6 },   // pintu ruang meeting
  { x: 6.8, z: 4.9 },    // depan resepsionis
  { x: -0.5, z: 4.2 },   // jalur tengah
  { x: -3.2, z: -6.2 },  // dekat tanaman belakang
];

// Semua titik tujuan harus berada di luar rintangan & dalam batas ruangan
// (lantai BoxGeometry(26, 20) → ±13 / ±10). Dipakai test & bisa dipakai ulang
// saat menambah tujuan baru supaya agen tidak pernah ditugaskan ke spot valid.
export function isSafeDestination(d, inObstacleFn, bounds = { x: 12.5, z: 9.5 }) {
  return (
    Number.isFinite(d.x) && Number.isFinite(d.z) &&
    Math.abs(d.x) <= bounds.x && Math.abs(d.z) <= bounds.z &&
    !inObstacleFn(d.x, d.z)
  );
}
