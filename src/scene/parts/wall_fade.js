// Wall fade (diekstrak dari blok IIFE dinding OfficeScene.js).
// Murni: hitung nilai fade per dinding + visibilitas tiang sudut.
// Penerapan opacity/visible ke mesh nyata tetap di OfficeScene (butuh referensi).

// fadeOf: 1 = solid, 0 = hilang. d = jarak kamera di luar bidang dinding (negatif = di dalam).
// Persis kode lama: max(0, min(1, 1-(d+1.5)/6)).
export function wallFadeOf(d) {
  return Math.max(0, Math.min(1, 1 - (d + 1.5) / 6));
}

// Satu langkah fade utk satu dinding. objs: daftar mesh; memutasi m.visible &
// m.material.opacity. Return nilai fade (0..1). on = fade > 0.04 (persis lama).
export function applyWallFade(objs, fade) {
  const on = fade > 0.04;
  (objs || []).forEach(m => {
    m.visible = on;
    if (on && m.material && !Array.isArray(m.material)) {
      m.material.transparent = true;
      m.material.opacity = fade;
    }
  });
  return on;
}

// Visibilitas tiang sudut: tiang mengikuti dinding yang lebih terlihat.
// corners: [{position:{x,z}}]; val: {front,right,back,left} nilai fade.
// Persis lama: visible = max(val[kx], val[kz]) > 0.5 (kx = kiri/kanan dari x, kz = depan/belakang dari z).
export function cornerVisibility(corners, val) {
  const out = [];
  (corners || []).forEach(m => {
    const kx = m.position.x < 0 ? 'left' : 'right';
    const kz = m.position.z < 0 ? 'front' : 'back';
    const vis = Math.max(val[kx], val[kz]) > 0.5;
    out.push({ m, vis });
  });
  return out;
}

// Satu tick penuh __wallFade(cam): hitung fade tiap dinding (pembulatan 2 desimal),
// terapkan ke mesh, hitung visibilitas tiang. wallDefs: {front:{objs,out},...}.
// Return objek val (pembulatan + posisi kamera) untuk debug window.__wallLast.
export function wallFadeTick(wallDefs, corners, cam) {
  const val = {};
  for (const k in wallDefs) {
    const a = wallFadeOf(wallDefs[k].out(cam));
    val[k] = +a.toFixed(2);
    applyWallFade(wallDefs[k].objs, a);
  }
  cornerVisibility(corners, val).forEach(({ m, vis }) => { m.visible = vis; });
  return { ...val, cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.z.toFixed(1)] };
}
