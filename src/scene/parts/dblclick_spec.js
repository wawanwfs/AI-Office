// parts/dblclick_spec.js — perilaku klik-ganda kanvas (murni, diuji unit).
// Diekstrak dari handler dblclick OfficeScene.js yang menuliskan formula
// anchor/kamera secara inline. Satu sumber kebenaran utk goal zoom dblclick.
//
// Regresi siklus 118: cabang agen dblclick TIDAK memanggil ensureHomeRadius/
// saveCam (satu-satunya jalur fokus yang skip keduanya — Escape "kembali"
// tidak berfungsi setelah dblclick agen) dan goal-nya STATIS tanpa `follow`
// sehingga MENIMPA goal follow yang baru saja dibuat klik pertama dari
// double-click (kamera berhenti mengikuti agen yang berjalan). Goal agen
// kini selalu follow + konsisten dengan jalur klik tunggal.
import { selAnchorOf, ringFloorY } from './ring_spec.js';

const safeRadius = (radius) => (typeof radius === 'number' && isFinite(radius)) ? radius : 42.5;

// Posisi fokus kamera utk satu agen: walker (berjalan) → posisi walker,
// duduk → posisi kursi (home + offset 0.55 ke arah meja), +1.5 (mata).
// Null bila agen tak terlihat di kantor (offsite/meeting) — pemanggil
// memutuskan fallback (klik tunggal: fokus meja kosong; dblclick: maju).
export function agentFocusPos(a) {
  const p = selAnchorOf(a);
  if (!p) return null;
  return { x: p.x, y: (ringFloorY(a) || 0) + 1.5, z: p.z + p.off };
}

// Goal dblclick pada agen: follow kamera ikut agen (sama dgn klik tunggal —
// klik pertama double-click sudah membuat goal follow; dblclick kini
// IDEMPOTEN, bukan menimpanya dgn goal statis). r = min(radius, 24).
export function dblclickAgentGoal(a, radius) {
  const p = a ? agentFocusPos(a) : null;
  if (!p) return null;
  return { t: p, r: Math.min(safeRadius(radius), 24), follow: a };
}

// Goal dblclick pada titik objek non-agen (mis. mesh lain): maju ke titik
// klik, y di-clamp ≥ 1.5, r = min(radius, 18). Null bila titik tak valid.
export function dblclickPointGoal(point, radius) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return {
    t: { x: point.x, y: Math.max(1.5, (point.y || 0) + 0.8), z: point.z },
    r: Math.min(safeRadius(radius), 18),
  };
}

// Goal dblclick pada area kosong: maju 30% (r = max(14, radius*0.7)) ke
// target orbit saat ini (tgt) — perilaku lama dipertahankan.
export function dblclickBlankGoal(homeT, radius) {
  const r = safeRadius(radius);
  const t = homeT && Number.isFinite(homeT.x) && Number.isFinite(homeT.z)
    ? { x: homeT.x, y: homeT.y || 1.0, z: homeT.z }
    : { x: 0, y: 1.0, z: 0.6 };
  return { t, r: Math.max(14, r * 0.7) };
}
