// Spesifikasi geometri robot "Bantuin AI" — diekstrak murni (tanpa THREE) agar teruji unit:
// hipY/ty/hy per pose (berdiri vs duduk), arah wajah, dan daftar bagian mesh dengan posisi & sifatnya.
// buildRobot di robot.js memakai nilai-nilai ini; perubahan bentuk robot lolos dari sini.

export const ROBOT_COLORS = { metal: 0xdfe6ec, dark: 0x2a3340, mid: 0x9aa7b4, facePlate: 0x07141a, screen: 0x050d12 };

// Tingkat kunci per pose (berdiri / duduk)
export function pose(standing) {
  return {
    hipY: standing ? 0.56 : 0.5,
    tz: standing ? 0 : 0.02,
    fz: standing ? 1 : -1,
    ty: standing ? 0.79 : 0.74,
    hy: standing ? 1.12 : 1.1,
  };
}

// LED mata: 2 buah, simetris di x=±0.058, sedikit di atas pusat kepala, di depan layar wajah
export function eyes(p) {
  return [-1, 1].map((sd) => ({ x: sd * 0.058, y: p.hy + 0.025, z: p.tz + p.fz * 0.143 }));
}

// Senyum: 1 garis tengah + 2 ujung naik, semuanya sedikit di bawah mata
export function smile(p) {
  return [
    { x: 0, y: p.hy - 0.045, z: p.tz + p.fz * 0.143, w: 0.1 },
    { x: -0.06, y: p.hy - 0.035, z: p.tz + p.fz * 0.143, w: 0.03 },
    { x: 0.06, y: p.hy - 0.035, z: p.tz + p.fz * 0.143, w: 0.03 },
  ];
}

// Batang panel dada: 3 bar menyala dengan tinggi bervariasi, di sisi wajah (fz) torso
export function chestBars(p) {
  const bars = [0.04, 0.08, 0.06];
  return bars.map((h, i) => ({ h, x: -0.055 + i * 0.055, y: p.ty - 0.01 + h / 2, z: p.tz + p.fz * 0.112 }));
}

// Kaki berdiri: 2 kaki simetris dengan fase animasi berlawanan (kanan 0, kiri π)
export function legsStanding() {
  return [-1, 1].map((sd) => ({ x: sd * 0.075, y: 0.26, phase: sd > 0 ? 0 : Math.PI }));
}

// Lampu status & antena: putih di dada kanan-atas; antena puncak kepala + bola + halo
export function accents(p) {
  return {
    status: { x: 0.1, y: p.ty + 0.12, z: p.tz + p.fz * 0.108, color: 0xffffff },
    antenna: { y: p.hy + 0.25, tipY: p.hy + 0.34 },
  };
}
