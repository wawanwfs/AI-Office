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

// Perluasan destinasi multi-lantai kampus WFS PROJECT (L1 Atrium, L2 Mezzanine, L3 Penthouse)
export const CAMPUS_WALK_DESTINATIONS = [
  ...WALK_DESTINATIONS,
  { x: 2.2, z: -5.8, label: 'Datacenter Glass Wall (L1)' },
  { x: 11.5, z: -5.2, label: 'East Innovation Terrace (L1)' },
  { x: -11.5, z: -5.2, label: 'West Architecture Hub (L1)' },
  { x: 11.5, z: 1.2, label: 'Mezzanine East Balcony (L2)' },
  { x: -11.5, z: 1.2, label: 'Mezzanine West Pod (L2)' },
  { x: -6.0, z: 5.6, label: 'Executive Cafe Promenade (L3)' },
  { x: 6.5, z: 5.6, label: 'Penthouse Strategy Terrace (L3)' },
  { x: 0.0, z: 8.5, label: 'Founder Suite View Deck (L3)' },
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
