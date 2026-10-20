// Spesifikasi poster dinding kantor WFS Project (data murni, tanpa THREE/canvas).
// Dipakai furniture.js untuk render; diuji agar posisi/teks/warna tak regresi.

export const POSTER_Y = 2.2;
export const POSTER_W = 0.46;
export const POSTER_H = 0.66;
export const CANVAS_W = 120;
export const CANVAS_H = 160;
export const LINE_H = 24; // jarak antar baris teks pada canvas

export const POSTERS = [
  { x: -11.4, z: -2, c: '#0deef3', t: 'SHIP IT' },
  { x: -11.4, z: 3, c: '#f5a623', t: 'KUALITAS DULU' },
  { x: -11.4, z: 6, c: '#ff5252', t: 'BUILD DAILY' },
  { x: 11.4, z: -2, c: '#7c4dff', t: 'TEST EVERYTHING' },
  { x: 11.4, z: 3, c: '#00e676', t: 'WFS PROJECT' },
];

// Poster di dinding kiri (x<0) menghadap +x, dinding kanan menghadap -x.
export function posterFacing(x) {
  return x < 0 ? Math.PI / 2 : -Math.PI / 2;
}

// Offset kecil dari dinding agar plane tidak z-fighting dengan frame.
export function posterOffset(x) {
  return x < 0 ? 0.03 : -0.03;
}

// Posisi Y baris teks ke-i pada canvas (baris pertama 64, turun LINE_H per baris).
export function posterLineY(i) {
  return 64 + i * LINE_H;
}
