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

// ─── Double-tap mobile (siklus 175) ──────────────────────────────────────────
// Konvensi viewport WebGL: tarikan dua jari = ZOOM, satu jari = PUTAR — tidak
// ada padanan mouse dblclick di layar sentuh (dblclick browser hanya terpicu
// pointer mouse; tap ganda cepat di touch di-blok Chrome sebagai aksi
// zoom-halaman). Zoom jujur (siklus 121): goal TIDAK dibatalkan — delta radius
// EKSAK diteruskan via zoomFocusGoal sehingga follow/lantai/titik tetap hidup.
// Deklaratif di dblclick_spec (bukan inline) supaya jalur tap-ganda & dblclick
// mouse satu sumber kebenaran, satu keluarga penguji unit.
const TAP_SLOP_PX = 24;        // jarak maks tap-1↔tap-2 (miring = drag, bukan tap)
const TAP_WINDOW_MS = 350;     // selisih waktu maks antar tap (kenyamanan)
const TAP_OUT_PX = 36;         // tap-2 bergeser dari tap-1 melewati ini = bukan double-tap
export const DTAP_ZOOM_STEP = 0.82; // radius ×0.82 per tap-ganda (~+22% zoom in)

// Kandidat tap valid: tekanan turun ke naik di titik hampir sama (≤TAP_SLOP_PX)
// — drag putar & pinch TIDAK lolos gerbang ini.
export function tapCandidate({ x0, y0, x1, y1, t0, t1, slop = TAP_SLOP_PX }) {
  if (t1 - t0 > 300) return false; // tap tunggal tak boleh lama (press-and-hold)
  const dx = x1 - x0, dy = y1 - y0;
  return Math.hypot(dx, dy) <= slop;
}

// Menerima double-tap? Kedua tap masing-masing valid (tapCandidate) + waktu
// antar naik ≤ TAP_WINDOW_MS + jarak antar tap ≤ TAP_OUT_PX.
export function isDoubleTap(c1, c2, { window = TAP_WINDOW_MS, out = TAP_OUT_PX } = {}) {
  if (!c1 || !c2) return false;
  if (!tapCandidate(c1) || !tapCandidate(c2)) return false;
  if ((c2.t1 - c1.t1) > window) return false;
  return Math.hypot(c2.x1 - c1.x1, c2.y1 - c1.y1) <= out;
}

// Radius berikutnya setelah double-tap: satu sumber utk zoom-IN tap-ganda
// (delegasi zoomRadius — clamp 12..130 & anti-poisoning sama dgn wheel/pinch).
// `dtapDir` (dari arah tap kedua, lazimnya 'y') opsional utk zoom keluar.
export function dtapRadius(current, step = DTAP_ZOOM_STEP, dir = 1, zoomRadiusFn) {
  if (typeof zoomRadiusFn !== 'function') return current; // tanpa sumber → no-op aman
  return zoomRadiusFn(current, dir * Math.log(step));
}
