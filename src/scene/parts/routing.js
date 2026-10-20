// Routing koridor: hindari menembus meja & kursi.
// Baris meja di z=-3 / 1.5 / 6. Koridor depan baris (row-1.15) dan gang antar-baris
// (z=-0.75 / 3.75) bebas rintangan; semua lintasan lewat sana.
// Diekstrak murni (tanpa THREE/scene) agar bisa di-unit-test.
export const FRONT = [-4.15, 0.35, 4.85];
export const GANGS = [-0.75, 3.75];
export const bandOf = (z) => (z < -0.75 ? 0 : z < 3.75 ? 1 : 2);

export function routePath(a, b) {
  const ba = bandOf(a.z), bb = bandOf(b.z), path = [];
  if (ba !== bb) {
    const gz = (Math.max(ba, bb) - Math.min(ba, bb) === 1)
      ? GANGS[Math.min(ba, bb)]
      : (Math.abs(a.z - GANGS[0]) + Math.abs(b.z - GANGS[0]) < Math.abs(a.z - GANGS[1]) + Math.abs(b.z - GANGS[1]) ? GANGS[0] : GANGS[1]);
    // keluar baris asal via koridor depan, turun/naik ke gang di x asal, seberang, masuk koridor depan baris tujuan
    path.push({ x: a.x, z: FRONT[ba] }, { x: a.x, z: gz }, { x: b.x, z: gz }, { x: b.x, z: FRONT[bb] });
  } else if (Math.abs(b.x - a.x) > 2.2) {
    // satu band tapi jauh: lewat koridor depan band agar tidak menembus meja rekan
    const fr = FRONT[ba];
    path.push({ x: a.x, z: fr }, { x: b.x, z: fr });
  }
  return path;
}
