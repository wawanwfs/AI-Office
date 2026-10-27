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
    return resetFocusGoal(homeT, homeRadius, radiusFallback);
  }
  return goal;
}

// Posisi fokus kamera utk satu agen — mirror EKSAK formula updateFollowGoal
// (walker visible → posisi walker; else home), +1.5 (tinggi mata). Dipakai
// jalur fokus agen: klik tunggal (OfficeScene), focusAgent (API), dan kini
// dblclick agen — sebelumnya formula `walker.visible?walker.position:home`
// terduplikasi 3× dan dblclick memakai formula titik generik yang berbeda.
// Null-safe: agen tak terlihat di kantor (offsite/meeting) → null —
// pemanggil memutuskan fallback (fokus home/meja kosong).
export function agentFocusPos(a) {
  if (!a || !a.home) return null;
  const fp = (a.walker && a.walker.visible) ? a.walker.position : { x: a.home.x, y: a.home.y || 0, z: a.home.z };
  return { x: fp.x, y: (fp.y || 0) + 1.5, z: fp.z };
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

// ── Siklus 115: helper interaksi kamera (murni, null-safe) ──────────
// Menggantikan duplikat inline di OfficeScene (7× clamp homeRadius,
// 7× snapshot __saved, 4× konstruksi goal reset) dengan satu sumber
// kebenaran yang bisa diuji unit tanpa renderer.

// Pastikan radius "rumah" tersimpan SEKALI (radius kamera saat fokus
// pertama dibuat, clamp 24..70). Return { homeRadius, saved } — saved
// true bila nilai baru dipasang (pemanggil tak perlu cek null lagi).
export function ensureHomeRadius(homeRadius, radius) {
  if (homeRadius !== null && homeRadius !== undefined) return { homeRadius, saved: false };
  const r = (typeof radius === 'number' && isFinite(radius)) ? radius : 42.5;
  return { homeRadius: Math.max(24, Math.min(70, r)), saved: true };
}

// Snapshot pose kamera sekali per sesi fokus (untuk "kembali" via
// Escape / setView). Return true bila snapshot baru dibuat.
// Null-safe: radius NaN/undefined (mis. goal rusak) → fallback 42.5,
// sehingga pose tersimpan selalu valid.
export function saveCam(sph) {
  if (!sph || sph.__saved) return false;
  const r = (typeof sph.radius === 'number' && isFinite(sph.radius)) ? sph.radius : 42.5;
  sph.__saved = { theta: sph.theta, phi: sph.phi, radius: r };
  return true;
}

// Goal reset ke HOME_TGT (klik area kosong / Escape / resetFocus /
// follow agent offsite). Null-safe: bila homeRadius belum pernah
// tersimpan (null/undefined/NaN) pakai radiusFallback — dulu jalur
// klik kosong meneruskan `r:homeRadius` mentah dan bila null, lerp
// focusStep membuat radius MELURUH ke ~0 (kamera runtuh ke titik
// target, view kosong/rusak) [bug siklus 115].
export function resetFocusGoal(homeT, homeRadius, radiusFallback) {
  const fb = (typeof radiusFallback === 'number' && isFinite(radiusFallback)) ? radiusFallback : 42.5;
  const hr = (typeof homeRadius === 'number' && isFinite(homeRadius)) ? homeRadius : null;
  return {
    t: homeT && typeof homeT.clone === 'function' ? homeT.clone() : { ...homeT },
    r: hr ? hr : fb,
    reset: true,
  };
}
