// Spesifikasi layout ruang meeting — data murni (tanpa THREE) agar bisa di-unit-test.
// Sumber historis: room.js / createMeetingRoom.

export const ROOM_CX = 8;   // pusat ruangan X
export const ROOM_CZ = -3;  // pusat ruangan Z

// Dimensi ruangan: dinding kaca pada x = CX ± 2.8, panel depan pada z = CZ + 2.75
export const GLASS_X = 2.8;   // jarak dinding kaca samping dari pusat
export const GLASS_Z = 2.75;  // jarak panel depan dari pusat
export const GLASS_H = 3.5;   // tinggi kaca

// Meja rapat: papan 3.9 × 0.07 × 1.55 di ketinggian 0.72, dua kaki panel pada dx ±1.55
export const TABLE = { w: 3.9, h: 0.07, d: 1.55, y: 0.72, legDX: 1.55 };

// Posisi relatif kursi terhadap pusat ruangan: 3 per sisi (z = CZ ± 1.1)
export const SEAT_DX = [-1.4, 0, 1.4];
export const SEAT_DZ = 1.1;

export function meetingSeats(cx = ROOM_CX, cz = ROOM_CZ) {
  const seats = [];
  for (const dx of SEAT_DX) {
    seats.push({ x: cx + dx, z: cz - SEAT_DZ, ry: 0 });
    seats.push({ x: cx + dx, z: cz + SEAT_DZ, ry: Math.PI });
  }
  return seats;
}

// Panel kaca: sisi kiri (sepanjang z) + dua panel depan (sepanjang x) dengan celah pintu di tengah
export function glassPanels(cx = ROOM_CX, cz = ROOM_CZ) {
  return [
    { w: 0.06, h: GLASS_H, d: 5.5, x: cx - GLASS_X, z: cz },
    { w: 1.8, h: GLASS_H, d: 0.06, x: cx - 1.9, z: cz + GLASS_Z },
    { w: 1.8, h: GLASS_H, d: 0.06, x: cx + 1.9, z: cz + GLASS_Z },
  ];
}

// Tiang rangka kaca: 4 titik pada (CX ± 2.8, CZ ± 2.75)
export function framePosts(cx = ROOM_CX, cz = ROOM_CZ) {
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    posts.push({ x: cx + sx * GLASS_X, z: cz + sz * GLASS_Z });
  }
  return posts;
}
