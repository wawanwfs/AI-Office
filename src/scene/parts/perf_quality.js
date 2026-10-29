// Adaptive quality — logika tangga degradasi diekstrak dari OfficeScene.animate()
// (murni, tanpa THREE/renderer) agar bisa diuji unit.
//
// Konteks: di GPU lambat (SwiftShader ~1.5 FPS) rendering peta bayangan +
// pixelRatio tinggi membuat scene patah-patah. Tangga: turunkan pixelRatio
// → kecilkan shadow map → matikan shadow. Tiap level hanya diterapkan SEKALI
// (latch, tak bolak-balik) kecuali recovery: pixelRatio setelah 4 sampel
// sehat (8 dtk), bayangan setelah 8 sampel sehat (16 dtk — siklus 147).
//
// Siklus 147 — recovery bayangan: dulu castShadow=false adalah latch PERMANEN —
// satu stall 2 dtk (GC, tab background, tabung mikrofon) mematikan bayangan
// seluruh sesi meski GPU ternyata kuat. Kini level shadow pulih bertahap,
// satu tangga per 16 dtk kesehatan stabil: L2 (bayangan mati) → L1 (map 1024)
// → berhenti; naik ke map 2048 TIDAK otomatis (blokir lonjakan memori GPU —
// pengguna bisa memuat ulang halaman bila mau full quality). Hysteresis:
// satu sampel FPS < 28 mereset hitungan recovery (anti on-off saat FPS napas).

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
  // anti-poisoning: timestamp/nomor frame non-finite (NaN/±Infinity) → no-op aman.
  // Jangan biarkan NaN masuk ke t0/lastFrame — selisih waktu jadi NaN dan tangga
  // degradasi/recovery berhenti bekerja (konsisten dgn pola sim_clock/motion_math).
  if (!Number.isFinite(nowMs) || !Number.isFinite(frame)) return { ...st };
  const sampleMs = o.fpsSampleMs || 2000;
  let s = { ...st };
  // state rusak non-finite (dari poison sebelumnya) → reset ke nilai aman
  if (!Number.isFinite(s.t0)) s.t0 = 0;
  if (!Number.isFinite(s.lastFrame)) s.lastFrame = 0;
  if (!Number.isFinite(s.fps)) s.fps = 0;
  if (!Number.isFinite(s.goodStreak)) s.goodStreak = 0;
  if (!Number.isFinite(s.shadowStreak)) s.shadowStreak = 0;
  const r = o.renderer;
  const sun = o.sun;
  if (!s.t0) { s.t0 = nowMs; return s; }
  if (nowMs - s.t0 < sampleMs) return s;
  s.fps = (frame - (s.lastFrame || 0)) / ((nowMs - s.t0) / 1000);
  s.t0 = nowMs;
  s.lastFrame = frame;
  // Siklus 147: catat pixelRatio terkini ke state → chip kualitas HUD bisa
  // menampilkan angka render tanpa membaca renderer langsung (murni).
  if (r) s.pixelRatio = r.getPixelRatio();
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
    // Siklus 147: flag utk chip HUD — pemulihan aktif sejak streak pertama.
    s.recovering = s.goodStreak > 0 && s.fps >= 28;
    if (s.goodStreak >= 4 && s.fps >= 28 && r) {
      const pr = Math.min(s.basePR, r.getPixelRatio() + 0.25);
      if (pr > r.getPixelRatio()) r.setPixelRatio(pr);
      if (r.getPixelRatio() >= s.basePR) { s.downgraded = false; s.goodStreak = 0; }
    }
  }
  // Siklus 147 — recovery bayangan: level shadow pulih BERTAHAP saat GPU sehat
  // stabil (8 sampel × 2 dtk = 16 dtk per tangga), bukan latch permanen lagi.
  // L2 (castShadow=false) → L1 (map 1024 kembali) → berhenti; naik ke 2048
  // TIDAK otomatis (hindari lonjakan alokasi VRAM tanpa sepengetahuan pengguna).
  // Hysteresis: satu sampel sehat-gagal (fps < 28) mereset hitungan — cegah
  // on-off saat FPS "bernapas" di sekitar ambang.
  if (s.shadowLevel && sun) {
    if (s.fps >= 28) {
      s.shadowStreak = (s.shadowStreak || 0) + 1;
      if (s.shadowStreak >= 8 && s.fps >= 28) {
        if (s.shadowLevel >= 2 && sun.castShadow === false) {
          // L2 → L1: bayangan menyala kembali pada resolusi 1024 (murah)
          s.shadowLevel = 1; s.shadowStreak = 0;
          sun.castShadow = true;
          if (sun.shadow && sun.shadow.mapSize) sun.shadow.mapSize.set(1024, 1024);
          if (o.needsShadowUpdate) o.needsShadowUpdate();
        } else {
          // L1 stabil lama → latch lepas: tangga recovery selesai
          s.shadowLevel = 0; s.shadowStreak = 0;
        }
      }
    } else {
      s.shadowStreak = 0;
    }
  } else if (s.shadowStreak) {
    s.shadowStreak = 0;
  }
  return s;
}

// ── Siklus 147: chip kualitas render HUD (murni, paritas connectionBadge) ──
// Menerjemahkan state perfStep jadi {state,label,detail}: ideal (hijau, FPS),
// degraded (amber — tangga aktif), recovering (biru, pulih berjalan).
// Tanpa data / perf tak tersedia → null (chip disembunyikan, bukan karangan).
const R = Math.round;
export function perfChip(p) {
  if (!p || !Number.isFinite(p.fps) || p.fps <= 0) return null;
  // < 10 FPS → 1 desimal gaya Indonesia (0,4); ≥ 10 → bulat (60). Tanpa
  // toLocaleString (deterministik lintas Node/browser, tanpa ketergantungan ICU).
  const fpsR = R(p.fps);
  const fpsTxt = fpsR >= 10 ? String(fpsR) : String(Math.round(p.fps * 10) / 10).replace('.', ',');
  const pr = Number.isFinite(p.pixelRatio) ? Math.round(p.pixelRatio * 100) / 100 : null;
  const prTxt = pr != null ? ` · x${pr}` : '';
  if (p.shadowLevel >= 2) {
    return { state: 'down', label: `GPU ${fpsTxt} FPS`, detail: `Kualitas otomatis: bayangan dimatikan (FPS ${fpsTxt}) — pemulihan otomatis bila FPS sehat 16 dtk${prTxt}` };
  }
  if (p.shadowLevel === 1) {
    return { state: 'stale', label: `GPU ${fpsTxt} FPS`, detail: `Kualitas otomatis: peta bayangan 1024, pixelRatio ${pr ?? '—'} (FPS ${fpsTxt}) — pulih bertahap saat FPS ≥ 28${prTxt}` };
  }
  if (p.recovering) {
    return { state: 'recover', label: `GPU ${fpsTxt} FPS`, detail: `Kualitas pulih: pixelRatio ${pr ?? '—'} (FPS ${fpsTxt}) — penuh bila FPS tetap sehat${prTxt}` };
  }
  if (p.downgraded) {
    return { state: 'stale', label: `GPU ${fpsTxt} FPS`, detail: `Kualitas otomatis: pixelRatio ${pr ?? '—'} (FPS ${fpsTxt}) — pulih bertahap saat FPS ≥ 28${prTxt}` };
  }
  return { state: 'ideal', label: `GPU ${fpsTxt} FPS`, detail: `Render mulus: FPS ${fpsTxt}${prTxt}` };
}
