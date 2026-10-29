// parts/kamera_focus.js — Kamera fokus: follow agent + lerp ke target + auto-rotate (murni, diuji unit).
// Diekstrak dari blok inline di OfficeScene.animate() agar logika lerp/follow/
// reset dapat diuji tanpa renderer.
import { levelOf, agentLiveLevel } from './agent_status.js';

// Anchor follow goal utk satu agen: peserta RAPAT (figAnchor terisi — kursi
// rapat, di-resolve per-frame dari figur) MENANG atas walker/home; agen biasa
// → mirror eksak formula updateFollowGoal (walker visible → posisi walker;
// else home), +1.5 (tinggi mata). Null-safe: tanpa figAnchor & tanpa
// walker/home valid (mis. follow {meetIdx} dgn rapat sudah usai DAN root
// tak tersedia) → null — pemanggil mempertahankan goal lama.
export function followAnchor(a, figAnchor) {
  if (figAnchor) return figAnchor;
  if (!a) return null;
  if (a.walker && a.walker.visible) {
    const p = a.walker.position;
    if (!p) return null;
    return { x: p.x, y: (p.y || 0) + 1.5, z: p.z };
  }
  const h = a.home;
  if (!h) return null;
  return { x: h.x, y: (h.y || 0) + 1.5, z: h.z };
}

// Perbarui goal follow: target kamera mengikuti posisi agen saat ini.
// figAnchor (opsional): anchor kursi rapat peserta yang di-follow —
// OfficeScene resolve dari figur tiap frame (bisa HILANG saat rapat usai →
// jatuh ke home meja agen via follow.root). Return: goal baru (objek sama,
// dimutasi t.set) atau goal reset baru.
export function updateFollowGoal(goal, homeRadius, radiusFallback, homeT = { x: 0, y: 1.8, z: 0 }, figAnchor = null) {
  const f = goal.follow;
  // Follow figur rapat ({meetIdx, root}) → agen ada di .root; follow biasa →
  // objek follow itu sendiri (walker/home langsung).
  const agent = (f && f.meetIdx != null) ? f.root : f;
  const fp = followAnchor(agent, figAnchor);
  if (!fp) return goal; // tidak ada anchor valid → pertahankan goal (jangan merusak tgt)
  goal.t.set(fp.x, fp.y, fp.z);
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
  // Guard anti-poisoning: goal non-finite (NaN/±Infinity) → no-op aman.
  // Lerp dari goal korup akan menulari tgt/sph → posisi kamera NaN
  // (kamera runtuh/lenyap). Konsisten dgn guard anti-poisoning modul lain
  // (motion_math.stepMove, label_overlap, sim_clock, resetFocusGoal).
  if (!Number.isFinite(goalT.x) || !Number.isFinite(goalT.y) ||
      !Number.isFinite(goalT.z) || !Number.isFinite(goalR)) {
    return false;
  }
  tgt.x += (goalT.x - tgt.x) * .06;
  tgt.y += (goalT.y - tgt.y) * .06;
  tgt.z += (goalT.z - tgt.z) * .06;
  sph.radius += (goalR - sph.radius) * .06;
  if (goalPhi !== undefined && Number.isFinite(goalPhi)) sph.phi += (goalPhi - sph.phi) * .06;
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

// ── Siklus 146: lantai kamera → FloorNavigator (pelapor terpusat per-frame) ──
// Keluarga bug siklus 142–145: tiap jalur fokus melaporkan lantai SATU KALI di
// titik klik (onSelectAgent / onCameraFloor). Tiga jalur lolos:
//   1. FOLLOW: kamera mengikuti agen yang BERJALAN lintas lantai (rapat→L1,
//      lunch kafe→L3, pulang) — nav beku di lantai saat agen diklik.
//   2. Klik papan proyek (single + dblclick): goal z=13.2 (dinding L3) —
//      panel proyek terbuka, nav tidak ikut.
//   3. dblclick nexus: goal z=6.1 (L3) tanpa onSelectAgent.
// Lantai kini dihitung dari TARGET GOAL (bukan titik intersect/posisi orbit —
// dinding belakang transparan saat zoom-in bisa mengarahkan ray keluar kantor)
// tiap frame oleh animate(); callback App HANYA dipanggil saat lantai BERUBAH.
//
// goalFloor(goal, homeT): lantai kamera utk satu goal — {follow} → lantai LIVE
// agen via agentLiveLevel (satu sumber kebenaran dgn badge 142/143/144);
// goal reset (klik kosong/Escape) & dblclick area kosong TIDAK melapor (null) —
// kembali ke overview bukan perpindahan lantai; goal statis → levelOf(goal.t.z).
// Guard anti-poisoning: goal korup / lantai korup → null (diam, bukan lantai palsu).
export function goalFloor(goal, homeT) {
  if (!goal || !goal.t) return null;
  const z = goal.t.z;
  if (typeof z !== 'number' || !Number.isFinite(z)) return null;
  if (goal.reset) {
    // Kembali ke HOME_TGT = overview semua lantai — BUKAN pindah lantai.
    const home = homeT && Number.isFinite(homeT.z) ? homeT.z : null;
    return (home !== null && z === home) ? null : levelOf(z);
  }
  // dblclick area kosong = maju 30% menuju tgt saat ini (zoom idle) — kamera
  // bisa saja di rumah (tgt z=0.3 → "L2") tanpa niat pindah lantai: JANGAN
  // dilaporkan. Berbeda dgn dblclick titik objek (fokus sadar-lantai).
  if (goal.blank) return null;
  const f = goal.follow;
  if (f) {
    const agent = (f.meetIdx != null) ? f.root : f;
    let lvl = null;
    try { lvl = agentLiveLevel(agent); } catch { /* state korup → fallback posisi */ }
    return lvl || levelOf(z);
  }
  return levelOf(z);
}

// cameraFloorFrame(goal, last, homeT): satu langkah pelapor per-frame.
// Return { level, changed } — level=goalFloor(goal) (null → report null:
// pemicu reset latch), changed=true hanya bila lantai non-null BERBEDA dari
// last (latch: callback App hanya menyala saat perpindahan lantai nyata).
export function cameraFloorFrame(goal, last, homeT) {
  const lvl = goalFloor(goal, homeT);
  if (lvl === null || lvl === undefined) return { level: null, changed: false };
  return { level: lvl, changed: lvl !== last };
}
