// Kamera fokus: follow agent + lerp ke target + auto-rotate (murni, diuji unit).
// Diekstrak dari blok inline di OfficeScene.animate() agar logika lerp/follow/
// reset dapat diuji tanpa renderer.

// Perbarui goal follow: target kamera mengikuti posisi agent saat ini
// (walker visible → posisi walker; else posisi home), dan transisi ke
// mode reset saat agent offsite.
// return: goal baru (objek sama, dimutasi t.set) atau goal reset baru.
export function updateFollowGoal(goal, homeRadius, radiusFallback, homeT = { x: 0, y: 1.8, z: 0 }) {
  const f = goal.follow;
  const fp = f.walker && f.walker.visible ? f.walker.position : { x: f.home.x, y: f.home.y || 0, z: f.home.z };
  goal.t.set(fp.x, (fp.y || 0) + 1.5, fp.z);
  if (f.state === 'offsite') {
    return { t: homeT.clone ? homeT.clone() : { ...homeT }, r: homeRadius || radiusFallback, reset: true };
  }
  return goal;
}

// Satu langkah kamera: lerp posisi target & radius ke goal (faktor .06),
// opsi goalPhi untuk menyelaraskan pitch kamera bila disediakan,
// lalu bila goal.reset dan target sudah dekat HOME_TGT (<.05) goal selesai.
// tgt = {x,y,z}, sph = {radius,theta,phi,...} — dimutasi langsung.
// return: true bila goal reset selesai (pemanggil boleh set focusGoal=null).
export function focusStep(tgt, sph, goalT, goalR, goalPhi) {
  tgt.x += (goalT.x - tgt.x) * .06;
  tgt.y += (goalT.y - tgt.y) * .06;
  tgt.z += (goalT.z - tgt.z) * .06;
  sph.radius += (goalR - sph.radius) * .06;
  if (goalPhi !== undefined) sph.phi += (goalPhi - sph.phi) * .06;
  return Math.sqrt(tgt.x * tgt.x + (tgt.y - 1.8) * (tgt.y - 1.8) + tgt.z * tgt.z) < .05;
}

// Auto-rotate idle: theta bertambah konstan per frame (0.0012 rad).
export function autoRotateStep(sph) { sph.theta += .0012; }
