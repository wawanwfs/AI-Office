// Routing koridor & tangga 3 lantai: hindari menembus meja & pastikan lewat tangga nyata saat pindah lantai.
// Baris meja di z=-3 / 1.5 / 6. Koridor depan baris (row-1.15) dan gang antar-baris bebas rintangan.
// Tangga Grand Staircase kembar di x = -2.6 dan x = 2.6 menghubungkan L1<->L2 (z: -1.8 -> -0.6) dan L2<->L3 (z: 3.8 -> 5.0).
export const FRONT = [-4.15, 0.35, 4.85];
export const GANGS = [-0.75, 3.75, -1.8, -0.6, 3.8, 5.0];
export const bandOf = (z) => (z < -0.75 ? 0 : z < 3.75 ? 1 : 2);

// Tangga Grand Staircase kembar: X = -2.6 (kiri) dan X = 2.6 (kanan)
export const STAIR_X = [-2.6, 2.6];
export const getNearestStairX = (x) => (Math.abs(x - (-2.6)) < Math.abs(x - 2.6) ? -2.6 : 2.6);

export function routePath(a, b) {
  const ba = bandOf(a.z), bb = bandOf(b.z), path = [];
  if (ba !== bb) {
    // Jalur antar lantai WAJIB melewati tangga arsitektural di X = ±2.6
    const sx1 = getNearestStairX(a.x);
    const sx2 = getNearestStairX(b.x);

    // Kasus 1: L1 (0) <-> L2 (1)
    if ((ba === 0 && bb === 1) || (ba === 1 && bb === 0)) {
      const zL1 = -1.8; // kaki tangga di L1
      const zL2 = -0.6; // kepala tangga di L2
      path.push({ x: a.x, z: FRONT[ba] });
      if (ba === 0) {
        // Naik: kaki tangga L1 -> kepala tangga L2
        path.push({ x: sx1, z: FRONT[0] }, { x: sx1, z: zL1 }, { x: sx1, z: zL2 }, { x: b.x, z: FRONT[1] });
      } else {
        // Turun: kepala tangga L2 -> kaki tangga L1
        path.push({ x: sx1, z: FRONT[1] }, { x: sx1, z: zL2 }, { x: sx1, z: zL1 }, { x: b.x, z: FRONT[0] });
      }
    }
    // Kasus 2: L2 (1) <-> L3 (2)
    else if ((ba === 1 && bb === 2) || (ba === 2 && bb === 1)) {
      const zL2 = 3.8; // kaki tangga di L2
      const zL3 = 5.0; // kepala tangga di L3
      path.push({ x: a.x, z: FRONT[ba] });
      if (ba === 1) {
        // Naik: kaki tangga L2 -> kepala tangga L3
        path.push({ x: sx1, z: FRONT[1] }, { x: sx1, z: zL2 }, { x: sx1, z: zL3 }, { x: b.x, z: FRONT[2] });
      } else {
        // Turun: kepala tangga L3 -> kaki tangga L2
        path.push({ x: sx1, z: FRONT[2] }, { x: sx1, z: zL3 }, { x: sx1, z: zL2 }, { x: b.x, z: FRONT[1] });
      }
    }
    // Kasus 3: L1 (0) <-> L3 (2) melintasi dua tangga sekaligus!
    else if ((ba === 0 && bb === 2) || (ba === 2 && bb === 0)) {
      path.push({ x: a.x, z: FRONT[ba] });
      if (ba === 0) {
        // L1 -> Stair 1 -> L2 -> Stair 2 -> L3
        path.push(
          { x: sx1, z: FRONT[0] }, { x: sx1, z: -1.8 }, { x: sx1, z: -0.6 },
          { x: sx1, z: FRONT[1] }
        );
        if (sx1 !== sx2) path.push({ x: sx2, z: FRONT[1] });
        path.push(
          { x: sx2, z: 3.8 }, { x: sx2, z: 5.0 },
          { x: b.x, z: FRONT[2] }
        );
      } else {
        // L3 -> Stair 2 -> L2 -> Stair 1 -> L1
        path.push(
          { x: sx1, z: FRONT[2] }, { x: sx1, z: 5.0 }, { x: sx1, z: 3.8 },
          { x: sx1, z: FRONT[1] }
        );
        if (sx1 !== sx2) path.push({ x: sx2, z: FRONT[1] });
        path.push(
          { x: sx2, z: -0.6 }, { x: sx2, z: -1.8 },
          { x: b.x, z: FRONT[0] }
        );
      }
    }
  } else if (Math.abs(b.x - a.x) > 2.2) {
    // satu band tapi jauh: lewat koridor depan band agar tidak menembus meja rekan
    const fr = FRONT[ba];
    path.push({ x: a.x, z: fr }, { x: b.x, z: fr });
  }
  return path;
}
