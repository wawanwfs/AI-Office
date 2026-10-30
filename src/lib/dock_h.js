// Siklus 184 — tinggi dock mobile ADAPTIF: tombol dock kini 24 (siklus
// 178/182/183 menambah FOTO/AGEN/MUNDUR) → di layar ≤560px dock membungkus
// 3–4 baris. Dulu tinggi di-clamp CSS `max-height: 120px` (era 2 baris) dan
// HUD/toast memakai offset statis 148/200px → baris terakhir meluap keluar
// kapsul kaca (390px), bahkan TERPOTONG viewport di 360px (tombol tak bisa
// diklik). Kini App mengukur tinggi .dock live dan menulis CSS var
// `--dock-h` (px) di documentElement; index.css memakai
// `calc(var(--dock-h) + inset)` utk HUD/toast — benar di semua jumlah baris.
//
// Murni & tanpa React agar diuji unit: modul ini hanya transformasi angka +
// penulisan properti, semua akses DOM disuntik (pola lib lain: modal.js).

export const DOCK_H_VAR = '--dock-h';
// Fallback CSS index.css = 130px (≤560px) — setter tidak boleh menulis nilai
// di bawahnya (jendela tanpa JS/saat pertama render tetap tidak lebih sempit
// dari era statis).
export const DOCK_H_MIN = 130;
// Siklus 185 — var PENDAMPING tinggi dock MENTAH (tanpa clamp): dipakai CSS
// 561–760px utk offset HUD/toast era-eksak (85px dock + inset = persis posisi
// era nowrap, tak ada lompatan). Var utk ≤560px tetap di-clamp DOCK_H_MIN.
export const DOCK_H_RAW_VAR = '--dock-h-raw';

/**
 * Hitung nilai var dari tinggi dock terukur.
 * @param {number} dockH  tinggi .dock (px, getBoundingClientRect().height)
 * @returns {string} nilai CSS `--dock-h` (mis. "139px") atau null bila input
 *   tidak valid (anti-poisoning: NaN/≤0/negatif → null = jangan tulis apa pun,
 *   fallback CSS 130px tetap berlaku).
 */
export function dockHValue(dockH) {
  if (typeof dockH !== 'number' || !Number.isFinite(dockH) || dockH <= 0) return null;
  const px = Math.ceil(dockH);
  return `${Math.max(DOCK_H_MIN, px)}px`;
}

/** Siklus 185: nilai MENTAH (ceil, tanpa clamp DOCK_H_MIN) — null bila tak valid. */
export function dockHRawValue(dockH) {
  if (typeof dockH !== 'number' || !Number.isFinite(dockH) || dockH <= 0) return null;
  return `${Math.ceil(dockH)}px`;
}

/**
 * Tulis `--dock-h` ke target style. Aman dipanggil ulang (idempoten).
 * @param {number|null} dockH  tinggi terukur, atau null utk tidak melakukan apa pun
 * @param {object} target  elemen target style (default: document.documentElement)
 */
export function setDockHVar(dockH, target) {
  const t = target || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!t || !t.style) return false;
  const v = dockHValue(dockH);
  if (!v) return false;
  // Siklus 185: var pendamping MENTAH (tanpa clamp) ditulis serempak — CSS
  // 561–760px (offset HUD/toast era-eksak) & fallback CSS lain memakainya.
  const raw = dockHRawValue(dockH);
  if (raw) t.style.setProperty(DOCK_H_RAW_VAR, raw);
  t.style.setProperty(DOCK_H_VAR, v);
  return true;
}

/**
 * Pasang pengukur live tinggi .dock → CSS var. Return disconnector (atau null
 * bila lingkungan tak mendukung — SSR/tes jsdom tanpa ResizeObserver), pola
 * cleanup listener lain di App.
 * @param {object} opts { doc (default document), roCls (default ResizeObserver) }
 */
export function watchDockHeight(opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const ROCls = opts.roCls || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
  if (!doc || !ROCls) return null;
  let ro = null;
  const measure = () => {
    const dock = doc.querySelector ? doc.querySelector('.dock') : null;
    // getBoundingClientRect (BUKAN clientHeight): clientHeight mengabaikan
    // border (dock = 1px atas+bawah → beda 2px; terukur e2e TES1) dan
    // membundar — rect.height eksak, ceil menjaga offset HUD tak kurang.
    let h = null;
    if (dock) {
      if (typeof dock.getBoundingClientRect === 'function') h = dock.getBoundingClientRect().height;
      else h = dock.clientHeight;
    }
    return setDockHVar(h, doc.documentElement);
  };
  try {
    ro = new ROCls(() => measure());
    ro.observe(doc.querySelector('.dock') || doc.body);
  } catch {
    return null;
  }
  measure();
  return () => { try { ro.disconnect(); } catch { /* noop */ } ro = null; };
}
