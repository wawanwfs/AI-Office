// Adaptive quality — logika tangga degradasi diekstrak dari OfficeScene.animate()
// (murni, tanpa THREE/renderer) agar bisa diuji unit.
//
// Konteks: di GPU lambat (SwiftShader ~1.5 FPS) rendering peta bayangan +
// pixelRatio tinggi membuat scene patah-patah. Tangga: turunkan pixelRatio
// → kecilkan shadow map → matikan shadow. Tiap level hanya diterapkan SEKALI
// (latch, tak bolak-balik) kecuali recovery pixelRatio setelah FPS sehat.

/**
 * Satu langkah sampling performa. Dipanggil tiap frame dengan waktu nyata.
 * @param {object} st  state {t0, lastFrame, fps, downgraded, shadowLevel, goodStreak, basePR}
 * @param {number} nowMs       performance.now() saat ini
 * @param {number} frame       nomor frame saat ini
 * @param {object} opts  { renderer:{getPixelRatio,setPixelRatio}, sun:{castShadow,shadow}, fpsSampleMs=2000 }
 * @returns {object} state baru (disamping juga mengubah opts.renderer/sun via aksi eksplisit)
 */
export function perfStep(st, nowMs, frame, opts) {
  const o = opts || {};
  const sampleMs = o.fpsSampleMs || 2000;
  let s = { ...st };
  const r = o.renderer;
  const sun = o.sun;
  if (!s.t0) { s.t0 = nowMs; return s; }
  if (nowMs - s.t0 < sampleMs) return s;
  s.fps = (frame - (s.lastFrame || 0)) / ((nowMs - s.t0) / 1000);
  s.t0 = nowMs;
  s.lastFrame = frame;
  // Tangga 1: pixelRatio turun (bisa berkali-kali sampai 0.75)
  if (s.fps < 18 && r && r.getPixelRatio() > 0.75) {
    r.setPixelRatio(Math.max(0.75, r.getPixelRatio() - 0.25));
    s.downgraded = true; s.goodStreak = 0;
  }
  // Tangga 2: shadow map 2048 → 1024 (sekali, latch)
  if (s.fps < 10 && (!s.shadowLevel || s.shadowLevel < 1) && sun && sun.castShadow) {
    s.shadowLevel = 1;
    if (sun.shadow && sun.shadow.mapSize) sun.shadow.mapSize.set(1024, 1024);
    if (sun.shadow && sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  // Tangga 3: matikan shadow matahari total (sekali, latch)
  if (s.fps < 5 && (!s.shadowLevel || s.shadowLevel < 2) && sun && sun.castShadow) {
    s.shadowLevel = 2; sun.castShadow = false;
    if (o.needsShadowUpdate) o.needsShadowUpdate();
  }
  // Recovery: pixelRatio naik bertahap bila FPS sehat stabil (4 cek × 2 dtk = 8 dtk)
  if (s.downgraded && !s.shadowLevel) {
    if (!s.basePR && o.basePixelRatio) s.basePR = o.basePixelRatio;
    s.goodStreak = (s.goodStreak || 0) + 1;
    if (s.goodStreak >= 4 && s.fps >= 28 && r) {
      const pr = Math.min(s.basePR, r.getPixelRatio() + 0.25);
      if (pr > r.getPixelRatio()) r.setPixelRatio(pr);
      if (r.getPixelRatio() >= s.basePR) { s.downgraded = false; s.goodStreak = 0; }
    }
  }
  return s;
}
