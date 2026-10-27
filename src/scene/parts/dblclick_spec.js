// parts/dblclick_spec.js — perilaku klik-ganda kanvas (murni, diuji unit).
// Diekstrak dari handler dblclick OfficeScene.js yang menuliskan formula
// anchor/kamera secara inline. Satu sumber kebenaran utk goal zoom dblclick.
//
// Regresi siklus 118: dblclick pada AGEN tidak punya cabang sendiri — jatuh ke
// goal titik generik STATIS (tanpa `follow`) sehingga MENIMPA goal follow yang
// baru saja dibuat klik pertama (kamera berhenti mengikuti agen yang berjalan),
// dan dblclick pada NEXUS menimpa goal r:16 klik pertama dgn goal titik kepala
// (y mengikuti titik intersect). Kini: cabang agen & nexus idempoten dgn klik
// pertama (di OfficeScene via fokusAgentRoot + goal nexus eksplisit). Modul
// ini menyatukan dua goal sisa dblclick (titik objek & area kosong) yang dulu
// inline; posisi fokus agen di agentFocusPos() (parts/kamera_focus.js).
const safeRadius = (radius) => (typeof radius === 'number' && isFinite(radius)) ? radius : 42.5;

// Goal dblclick pada titik objek non-agen (mis. karakter lain / mesh): maju ke
// titik klik, y di-clamp ≥ 1.5, r = min(radius, 18). Null bila titik tak valid.
export function dblclickPointGoal(point, radius) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return {
    t: { x: point.x, y: Math.max(1.5, (point.y || 0) + 0.8), z: point.z },
    r: Math.min(safeRadius(radius), 18),
  };
}

// Goal dblclick pada area kosong: maju 30% (r = max(14, radius*0.7)) menuju
// target orbit saat ini (tgt) — perilaku lama dipertahankan.
export function dblclickBlankGoal(homeT, radius) {
  const r = safeRadius(radius);
  const t = homeT && Number.isFinite(homeT.x) && Number.isFinite(homeT.z)
    ? { x: homeT.x, y: homeT.y || 1.0, z: homeT.z }
    : { x: 0, y: 1.0, z: 0.6 };
  return { t, r: Math.max(14, r * 0.7) };
}
