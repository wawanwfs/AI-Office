// Data zona lantai markas — diekstrak murni dari flooring.js agar bisa diuji unit.
// CAFÉ patch menempel kafe fisik (counter L di -9.5,7.5) — dulu di tengah lantai
// menimpa tepi meja SARI/SUPPORT HUMAN; WELCOME & LOUNGE digeser ke sofa lounge asli.
export const ZONES = [
  { x: -6, z: -1.2, w: 11, d: 7.5, color: 0x1E3A5F, label: 'DEV DESK' },
  { x: 8, z: -3, w: 5.4, d: 5.4, color: 0x4A3A1A, label: 'MEETING', op: .9 },
  { x: 10.3, z: 6.85, w: 4.2, d: 4.7, color: 0x143326, label: 'WELCOME & LOUNGE' },
  { x: -9.3, z: 8.0, w: 4.4, d: 2.4, color: 0x2E1533, label: 'CAFÉ' },
  { x: 2.5, z: -8, w: 4, d: 2.6, color: 0x1F1F2E, label: 'SERVER ROOM', dy: -0.9 },
];

// Label zona ditempatkan di tepi DEPAN zona (bukan tengah) supaya tidak menumpuk
// name tag agent yang duduk/berdiri di dalam area zona.
export function zoneLabelY(z) {
  return z.z - z.d / 2 + 0.7 + (z.dy || 0);
}

// Skala sprite label: label panjang (>9 karakter) lebih besar.
export function zoneLabelScale(label) {
  return label.length > 9 ? 1.25 : 1;
}
