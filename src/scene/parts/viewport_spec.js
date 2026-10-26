// viewport_spec.js — Spesifikasi responsivitas kanvas 3D, aspek rasio, FOV kamera,
// radius adaptif, serta perhitungan NDC pointer akurat untuk multi-window & layar split.
// Murni & deterministik, bebas efek samping DOM/WebGL.

export const BASE_FOV_DESKTOP = 54;
export const BASE_FOV_TABLET_PORTRAIT = 56;
export const BASE_FOV_MOBILE_PORTRAIT = 64;

export const BASE_RADIUS_DESKTOP = 42.5;
export const BASE_RADIUS_TABLET_PORTRAIT = 48;
export const BASE_RADIUS_MOBILE_PORTRAIT = 48;

/**
 * Hitung rasio aspek kanvas secara aman (bebas pembagian dengan 0).
 */
export function computeAspect(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return w / h;
}

/**
 * Deteksi apakah orientasi viewport saat ini bertipe portrait / split vertikal sempit.
 */
export function isPortraitViewport(aspect) {
  return (Number(aspect) || 1) < 0.8;
}

/**
 * Tentukan Field of View (FOV) kamera berdasarkan rasio aspek:
 * - aspect < 0.6 (mobile vertikal / split sempit): 64° agar sisi kampus 34m tidak terpotong
 * - aspect < 0.8 (tablet portrait / split medium): 56°
 * - default (desktop landscape / split lebar): 54°
 */
export function getResponsiveFov(aspect) {
  const asp = Number(aspect) || 1;
  if (asp < 0.6) return BASE_FOV_MOBILE_PORTRAIT;
  if (asp < 0.8) return BASE_FOV_TABLET_PORTRAIT;
  return BASE_FOV_DESKTOP;
}

/**
 * Tentukan jarak radius kamera (sph.radius) responsif:
 * Menarik kamera lebih dekat pada layar portrait agar kantor pas di tinggi layar.
 */
export function getResponsiveRadius(aspect, savedRadius = null, homeRadius = null, currentRadius = BASE_RADIUS_DESKTOP) {
  if (savedRadius !== null && savedRadius !== undefined && !Number.isNaN(Number(savedRadius))) {
    return Number(savedRadius);
  }
  if (homeRadius !== null && homeRadius !== undefined && !Number.isNaN(Number(homeRadius))) {
    return Number(homeRadius);
  }
  const asp = Number(aspect) || 1;
  if (asp < 0.6) return BASE_RADIUS_MOBILE_PORTRAIT;
  if (asp < 0.8) return BASE_RADIUS_TABLET_PORTRAIT;
  const cur = Number(currentRadius) || BASE_RADIUS_DESKTOP;
  return Math.min(cur, 56);
}

/**
 * Konfigurasi view offset untuk viewport sangat sempit (aspect < 0.6).
 */
export function getViewOffsetConfig(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const isNarrow = (w / h) < 0.6;
  return {
    enabled: isNarrow,
    fullWidth: w,
    fullHeight: h,
    offsetX: isNarrow ? -w * 0.045 : 0,
    offsetY: 0,
    width: w,
    height: h,
  };
}

/**
 * Hitung koordinat NDC (Normalized Device Coordinates) [-1, 1] dari event pointer
 * secara presisi berdasarkan posisi kanvas nyata di layar (getBoundingClientRect).
 * Menghindari bug salah sasaran raycast saat kanvas berada di mode layar split / multi-window / container offset.
 */
export function getCanvasPointerNdc(event, domElement) {
  if (!event) return { x: 0, y: 0 };

  if (!domElement || typeof domElement.getBoundingClientRect !== 'function') {
    const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1;
    const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1;
    const cx = event.clientX !== undefined ? event.clientX : 0;
    const cy = event.clientY !== undefined ? event.clientY : 0;
    const x = (cx / Math.max(1, w)) * 2 - 1;
    const y = -(cy / Math.max(1, h)) * 2 + 1;
    return {
      x: Object.is(x, -0) ? 0 : x,
      y: Object.is(y, -0) ? 0 : y,
    };
  }

  const rect = domElement.getBoundingClientRect();
  const width = Math.max(1, rect.width || domElement.clientWidth || 1);
  const height = Math.max(1, rect.height || domElement.clientHeight || 1);
  const clientX = event.clientX !== undefined ? event.clientX : rect.left;
  const clientY = event.clientY !== undefined ? event.clientY : rect.top;

  const x = ((clientX - rect.left) / width) * 2 - 1;
  const y = -((clientY - rect.top) / height) * 2 + 1;
  return {
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
  };
}

/**
 * Batasi jumlah bubble percakapan aktif berdasarkan lebar wadah layar:
 * Pada layar sempit (< 760px), batasi maksimal 2 agar kanvas 3D tidak sesak.
 */
export function getMaxBubbles(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return 3;
  return w < 760 ? 2 : 3;
}
