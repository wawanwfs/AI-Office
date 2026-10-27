// Anti-overlap label: pass kolisi berpasangan (diekstrak dari OfficeScene.js).
// pts: array {x, y, offX, offY, zone?, zt?, sw?, sh?, zw?, zh?} — koordinat & offset dalam piksel layar.
// Murni: mutasi offX/offY saja, tanpa THREE/canvas — unit-testable.

// PAD = breathing room: box diperluas per sisi supaya label tak "menempel" (<5px gap)
export const PAD_AGENT = 38;
export const PAD_ZONE = 46; // zona lebih sensitif: breathing room lebih besar

export const K_AGENT_AGENT = 1.2;   // dorongan dua arah agent↔agent
export const K_AGENT_BARRIER = 2.4; // agent bergeser penuh dari penghalang
export const K_ZONE_FROM_ZONE = 1.8;// zona digeser menjauh dari penghalang lain
export const K_AGENT_PUSHED = 1.6;  // agent didorong keluar dari zona
export const K_ZONE_TAG_ALONG = 0.8;// zona ikut geser sedikit saat agent vs zona
export const K_ZONE_TAG_X = 1.1;

// ── Sweep+clamp siklikal (diekstrak dari OfficeScene.js) ──
// GAP = breathing room vertikal antar label dalam sweep (px)
export const SWEEP_GAP = 44;
// Margin viewport: atas 140px cadangan lane header+ticker (HUD HTML, di luar canvas),
// bawah 110px toolbar (Rina pernah terpotong @90)
export const VIEW_TOP_MARGIN = 140;
export const VIEW_BOT_MARGIN = 110;
// Label zona paling sering bocor ke lane ticker — margin ekstra lebih besar
export const ZONE_TOP_EXTRA = 130; // 48→130: anti-overlap menarik balik ±60px setelah guard (terukur e2e_zone_multi), sisakan margin HUD 140px
export const PAD_X_ZONE = 6, PAD_X_AGENT = 2;
export const MAX_ROUNDS = 3;

// Sweep greedy: dari atas ke bawah, tiap label didorong ke bawah dari posisi
// terendah yang bebas overlap dengan semua label di atasnya. Mutasi offY.
export function sweepVertical(pts, gap = SWEEP_GAP) {
  const byY = pts.slice().sort((p, q) => (p.y + p.offY) - (q.y + q.offY));
  for (let i = 1; i < byY.length; i++) {
    const pi = byY[i];
    let minY = -Infinity;
    for (let j = 0; j < i; j++) {
      const pj = byY[j];
      if (Math.abs(pi.x + pi.offX - (pj.x + pj.offX)) >= ((pi.sw || pi.zw || 0) + (pj.sw || pj.zw || 0)) / 2 + gap) continue;
      const need = (pj.y + pj.offY) + ((pi.sh || pi.zh || 0) + (pj.sh || pj.zh || 0)) / 2 + gap;
      if (need > minY) minY = need;
    }
    if (minY > -Infinity && (pi.y + pi.offY) < minY) pi.offY = minY - (pi.y);
  }
}

// Clamp viewport: batas atas tepi layar, bawah toolbar, plus horizontal kiri/kanan.
// opts: {height, width, topMargin, botMargin}. Mengembalikan true bila ada pelanggaran
// yang dikoreksi (frame belum stabil), false bila semua label sudah dalam batas.
// Semantik Three.js NDC (y-up): atas layar = fy positif (+H/2), bawah = fy negatif (-H/2).
export function clampViewport(pts, opts) {
  const H2 = opts.height / 2;
  const botLim = H2 - (opts.botMargin ?? VIEW_BOT_MARGIN);
  const W2 = opts.width / 2;
  let violated = false;
  pts.forEach(p => {
    const fy = p.y + p.offY, half = (p.sh || p.zh || 0) / 2;
    const topLim = H2 - (opts.topMargin ?? VIEW_TOP_MARGIN) - (p.zone ? ZONE_TOP_EXTRA : 0);
    // Bocor atas (masuk header/ticker): fy + half > topLim → dorong turun (offY negatif)
    if (fy + half > topLim) {
      p.offY = topLim - half - p.y;
      violated = true;
    }
    // Bocor bawah (masuk toolbar): fy - half < -botLim → dorong naik (offY positif)
    else if (fy - half < -botLim) {
      p.offY = -botLim + half - p.y;
      violated = true;
    }
    // clamp HORIZONTAL: label tak boleh bocor keluar tepi kiri/kanan viewport
    const wHalf = (p.sw || p.zw || 0) / 2, fx = p.x + p.offX;
    const padX = p.zone ? PAD_X_ZONE : PAD_X_AGENT;
    if (fx + wHalf > W2 - padX) { p.offX = W2 - padX - wHalf - p.x; violated = true; }
    else if (fx - wHalf < -(W2 - padX)) { p.offX = -(W2 - padX) + wHalf - p.x; violated = true; }
  });
  return violated;
}

// Siklus sweep→clamp sampai stabil (maks MAX_ROUNDS). Sweep greedy bisa mendorong
// label melewati batas viewport, dan clamp bisa menimbulkan overlap baru — konvergen
// karena total ruang vertikal aman melebihi kebutuhan.
export function sweepClampRounds(pts, opts, rounds = MAX_ROUNDS) {
  for (let round = 0; round < rounds; round++) {
    sweepVertical(pts);
    if (!clampViewport(pts, opts)) break; // sweep+clamp sudah konsisten
  }
}

// ── Rumus konversi & penerapan offset (diekstrak dari animate() OfficeScene) ──
// Murni: hitung konversi piksel→satuan dunia, clamp offset agent, dan hitung
// offset zona (clamp berbeda: dy −10..52, dx −36..36). Tanpa THREE/canvas.

// worldPerPx: satuan dunia per piksel layar — ∝ jarak kamera & tan(fov/2), / tinggi layar.
// Guard viewport zona: koreksi posisi label zona yang proyeksinya bocor keluar
// margin layar. DIPANGGIL TIAP FRAME dari animate() (murah: 5 zona × project) —
// BUKAN di dalam blok relayout yang di-throttle tiap 4 frame (bug siklus 44:
// komentar mengaku "tiap frame" tapi bloknya masih di dalam throttle, sehingga
// koreksi tertunda ±4 frame & frame%4≠0 di awal animate tidak pernah jalan).
// deps: {camera, clientWidth, clientHeight, PX_PER_TAN, worldPerPx, accumulate} —
// murni terhadap THREE: proyeksi via camera.project, mutasi via callback accumulate.
// Return jumlah zona yang dikoreksi (untuk pengukuran/test).
export function zoneViewportGuard(zoneLabels, deps) {
  const { camera, clientWidth: W, clientHeight: H } = deps;
  if (!zoneLabels) return 0;
  let fixed = 0;
  zoneLabels.forEach(zt => {
    if (!zt.visible) return;
    const k = deps.PX_PER_TAN(H, camera.fov);
    const dz = Math.max(2, camera.position.distanceTo(zt.position));
    const zh = zt.scale.y * k / dz * 1.25, zw = zt.scale.x * k / dz * 1.06;
    const v = zt.position.clone().project(camera);
    if (v.z > 1) return;
    const fy = v.y * H / 2, fx = v.x * W / 2;
    // NDC y-UP: atas layar = fy positif (maks H/2), bawah = negatif.
    // BUG lama: kondisi atas/bawah memakai semantik y-down sehingga TERtukar —
    // label dekat atas layar (CAFÉ @ iso/top, DEV DESK @ front) tak pernah terkoreksi.
    const topLim = H / 2 - VIEW_TOP_MARGIN - ZONE_TOP_EXTRA, botLim = H / 2 - VIEW_BOT_MARGIN;
    let corr = 0;
    if (fy + zh / 2 > topLim) corr = topLim - zh / 2 - fy;          // bocor atas → turun (corr negatif)
    else if (fy - zh / 2 < -botLim) corr = -botLim + zh / 2 - fy;   // bocor bawah → naik (corr positif)
    let cx = 0;
    if (fx + zw / 2 > W / 2 - PAD_X_ZONE) cx = W / 2 - PAD_X_ZONE - zw / 2 - fx;
    else if (fx - zw / 2 < -(W / 2 - PAD_X_ZONE)) cx = -(W / 2 - PAD_X_ZONE) + zw / 2 - fx;
    if (corr || cx) {
      const wpp2 = deps.worldPerPx(dz, camera.fov, H);
      const zu = zt.userData || (zt.userData = {});
      if (zu.baseY === undefined) zu.baseY = zt.position.y;
      if (zu.baseX === undefined) zu.baseX = zt.position.x;
      if (zu.baseZ === undefined) zu.baseZ = zt.position.z;
      const MAX_ZONE_DISP_X = 2.0;
      const targetX = zt.position.x + cx * wpp2;
      const clampedX = Math.max(zu.baseX - MAX_ZONE_DISP_X, Math.min(zu.baseX + MAX_ZONE_DISP_X, targetX));
      const actDx = clampedX - zt.position.x;
      if (Math.abs(actDx) > 1e-4) {
        zt.position.x = clampedX;
        deps.accumulate(zt, 0, actDx);
        fixed++;
      }
      const isTopDown = (camera.position && typeof camera.position.y === 'number') &&
        ((camera.position.y - zt.position.y) / dz > 0.8);
      if (isTopDown) {
        const MAX_ZONE_DISP_Z = 2.0;
        const targetZ = zt.position.z + corr * wpp2;
        const clampedZ = Math.max(zu.baseZ - MAX_ZONE_DISP_Z, Math.min(zu.baseZ + MAX_ZONE_DISP_Z, targetZ));
        const actDz = clampedZ - zt.position.z;
        if (Math.abs(actDz) > 1e-4) {
          zt.position.z = clampedZ;
          deps.accumulate(zt, actDz, 0);
          fixed++;
        }
      } else {
        const MAX_ZONE_DISP_Y = 2.0;
        const targetY = zt.position.y + corr * wpp2;
        const clampedY = Math.max(zu.baseY - MAX_ZONE_DISP_Y, Math.min(zu.baseY + MAX_ZONE_DISP_Y, targetY));
        const actDy = clampedY - zt.position.y;
        if (Math.abs(actDy) > 1e-4) {
          zt.position.y = clampedY;
          deps.accumulate(zt, actDy, 0);
          fixed++;
        }
      }
    }
  });
  return fixed;
}

export function worldPerPx(dist, fovDeg, clientHeight) {
  return 2 * dist * Math.tan((fovDeg * Math.PI) / 360) / clientHeight;
}

// Hitung offset dunia utk satu pt (agent ATAU zona) dari offset piksel hasil anti-overlap.
// Agent: dy = clamp(offY*wpp*1.2, ≤46), dx = clamp(offX*wpp, −16..16).
// Zona : dyz = clamp(offY*wpp*1.2, −10..52), dxz = clamp(offX*wpp, −36..36).
// Return {dy, dx} utk agent (baseY+dy/baseX+dx) atau {dyz, dxz} utk zona.
export function labelWorldOffset(p, wpp) {
  if (p.zone) {
    const dyz = p.offY * wpp * 1.2;
    const dxz = Math.max(-36, Math.min(36, p.offX * wpp));
    return { dyz, dxz };
  }
  // dy TANPA clamp ke atas: clamp menyebabkan label tetap terpotong bila posisi dasar
  // keluar viewport (dy tak lagi proporsional thd offY). Viewport dijaga clampViewport.
  const dy = p.offY * wpp * 1.2;
  const dx = Math.max(-16, Math.min(16, p.offX * wpp));
  return { dy, dx };
}

// Akumulasi offset zona ke userData (antiY/antiX diakumulasi, bukan diganti),
// persis semantik OfficeScene: zu.antiY += dyz; zu.antiX += dxz.
export function accumulateZoneAnti(zt, dyz, dxz) {
  const zu = zt.userData || (zt.userData = {});
  zu.antiY = (zu.antiY || 0) + dyz;
  zu.antiX = (zu.antiX || 0) + dxz;
  return zu;
}

// Satu pass penuh (5 iterasi kolisi berpasangan) — mutasi offX/offY pts.
export function overlapPass(pts, iters = 5) {
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = 0; j < i; j++) {
        const zi = (pts[i].zone || pts[j].zone), PAD = zi ? PAD_ZONE : PAD_AGENT,
          lwi = (pts[i].sw || pts[i].zw || 0) + PAD, lhi = (pts[i].sh || pts[i].zh || 0) + PAD,
          lwj = (pts[j].sw || pts[j].zw || 0) + PAD, lhj = (pts[j].sh || pts[j].zh || 0) + PAD;
        const dx = Math.abs(pts[i].x - pts[j].x), dy = Math.abs((pts[i].y + pts[i].offY) - (pts[j].y + pts[j].offY));
        if (dx < (lwi + lwj) / 2 && dy < (lhi + lhj) / 2) {
          // geser vertikal dulu; bila vertikal mentok, geser horizontal ke arah bebas
          const h2 = ((lhi + lhj) / 2) - dy, w2 = ((lwi + lwj) / 2) - dx;
          if (pts[i].zone && pts[j].zone) { // dua penghalang (zona vs bubble): zona label yang digeser menjauh
            const zi2 = pts[i].zt ? i : (pts[j].zt ? j : -1), other = zi2 === i ? j : i;
            if (zi2 >= 0) {
              const h2b = ((lhi + lhj) / 2) - dy, w2b = ((lwi + lwj) / 2) - dx, up = pts[zi2].y < pts[other].y ? -1 : 1;
              pts[zi2].offY += up * h2b * K_ZONE_FROM_ZONE; const dz2 = (pts[zi2].x >= pts[other].x) ? 1 : -1; pts[zi2].offX += dz2 * w2b;
            }
          }
          else if (!pts[i].zone && !pts[j].zone) { // agent-agent: saling dorong dua arah
            pts[i].offY += h2 * K_AGENT_AGENT; pts[j].offY -= h2 * K_AGENT_AGENT;
            const dir = (pts[i].x >= pts[j].x) ? 1 : -1; pts[i].offX += dir * w2 * K_AGENT_AGENT; pts[j].offX -= dir * w2 * K_AGENT_AGENT;
          }
          else if (!pts[i].zone) { // agent vs penghalang: agent bergeser penuh
            pts[i].offY += h2 * K_AGENT_BARRIER; const dir = (pts[i].x >= pts[j].x) ? 1 : -1; pts[i].offX += dir * w2 * K_AGENT_AGENT;
            // jika penghalang adalah label zona, zona ikut geser sedikit — kluster padat zona+agent bisa over-cap agent
            if (pts[j].zt) { pts[j].offY -= h2 * K_ZONE_TAG_ALONG; pts[j].offX -= dir * w2 * K_ZONE_TAG_X; }
          }
          else if (!pts[j].zone) {
            pts[j].offY -= h2 * K_AGENT_PUSHED; const dir = (pts[j].x >= pts[i].x) ? 1 : -1; pts[j].offX += dir * w2 * 0.9;
          }
        }
      }
    }
  }
}

// ── Zona: jitter deterministik + fade saat membengkak (diekstrak dari OfficeScene.js) ──

// Hash string label → int 32-bit (deterministik per zona).
export function zoneHash(label) {
  let h = 0;
  for (const ch of (label || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

// Jitter deterministik per zona (hash label) supaya kluster label zona+agent
// tidak membentuk tumpukan simetris. return {jy, jx} dalam satuan dunia.
export function zoneJitter(label) {
  const h = zoneHash(label);
  return { jy: (h % 7) - 3, jx: ((h >> 3) % 9) - 4 };
}

// Fade zona saat terlalu besar di layar (kamera sangat dekat): sprite zona
// membengkak (ukuran piksel ∝ 1/jarak) dan menutupi label/tooltip agent.
// pw = piksel lebar zona; >340 mulai memudar hingga 0.03 (lalu invisible).
// return {opacity, visible} — null bila zona tidak perlu diubah (pw ≤ 340).
export function zoneScreenFade(pw) {
  // Guard anti-poisoning: pw non-finite (NaN/±Infinity) → tampil penuh (aman).
  if (!Number.isFinite(pw)) return { opacity: 1, visible: true };
  if (pw > 340) {
    const f = Math.max(0, 1 - (pw - 340) / 260);
    return { opacity: f, visible: f > 0.03 };
  }
  return { opacity: 1, visible: true };
}

// ── Pembangunan titik label (diekstrak dari animate() OfficeScene) ──
// Murni: dari daftar entitas + nilai proyeksi kamera, hasilkan array pts untuk
// overlapPass/sweepClampRounds. Tanpa THREE/canvas — unit-testable.

const PX_PER_TAN = (clientH, fovDeg) => clientH / (2 * Math.tan((fovDeg * Math.PI) / 360));

// pts label agent: sw/sh piksel sprite, baseY/baseX = posisi state dikurangi
// offset anti-tumpuk frame sebelumnya (offset TIDAK terakumulasi antar frame).
export function buildAgentPts(vis, k, pxW, pxH) {
  return vis.map(a => {
    const u = a.label.userData, v = a.proj;
    const by = (u && Number.isFinite(u.baseY)) ? u.baseY : (a.label.position.y - (u.antiY || 0));
    const bx = (u && Number.isFinite(u.baseX)) ? u.baseX : (a.label.position.x - (u.antiX || 0));
    return {
      a, zone: false,
      sw: a.label.scale.x * k, sh: a.label.scale.y * k,
      baseY: by, baseX: bx,
      x: v.x * pxW, y: v.y * pxH, offY: 0, offX: 0,
    };
  });
}

// pts label zona (penghalang statis). base dari posisi ASLI (window.__zoneBase)
// + jitter deterministik + akumulasi userData.antiY/antiX — tidak terakumulasi di posisi.
// entity: {visible, proj, dist, label, base, antiY, antiX, scale}
// v.z>1 (di belakang kamera) → dilewati. Return juga fade (zoneScreenFade) untuk penelepon.
export function buildZonePts(zones, k, pxW, pxH) {
  const out = [];
  (zones || []).forEach(z => {
    if (!z.visible) return;
    const v = z.proj;
    if (!v || v.z > 1) return;
    // Guard anti-poisoning: dist/scale non-finite (NaN/±Infinity) → fallback
    // aman (dz=2, skala=0). Math.max(2, NaN)=NaN → zw/zh NaN membuat label zona
    // tak ikut anti-overlap diam-diam; skala 0 = ukuran nol (no-op layout).
    const dz = Number.isFinite(z.dist) ? Math.max(2, z.dist) : 2;
    const sx = Number.isFinite(z.scale && z.scale.x) ? z.scale.x : 0;
    const sy = Number.isFinite(z.scale && z.scale.y) ? z.scale.y : 0;
    const pw = sx * k / dz;
    const zf = zoneScreenFade(pw);
    const zay = z.antiY || 0, zax = z.antiX || 0;
    const { jy, jx } = zoneJitter(z.label);
    const b = z.base || { y: 0, x: 0 };
    out.push({
      a: null, zone: true, zt: z.ref, fade: zf,
      zw: pw * 1.06, zh: sy * k / dz * 1.25,
      baseY: b.y + jy * 0.06 + zay, baseX: b.x + jx * 0.08 + zax,
      x: v.x * pxW, y: v.y * pxH, offY: 0, offX: 0,
    });
  });
  return out;
}

// pts bubble dialog (penghalang statis, sizeAttenuation=false → piksel konstan).
// bubble: {proj, scale} — v.z>1 dilewati.
export function buildBubblePts(bubbles, k, pxW, pxH) {
  const out = [];
  (bubbles || []).forEach(bb => {
    const v = bb.proj;
    if (!v || v.z > 1) return;
    out.push({
      a: null, zone: true, zt: null, bub: bb.ref,
      zw: bb.ref.scale.x * k, zh: bb.ref.scale.y * k,
      baseY: bb.ref.position.y, baseX: bb.ref.position.x,
      x: v.x * pxW, y: v.y * pxH, offY: 0, offX: 0,
    });
  });
  return out;
}

export { PX_PER_TAN };

// Reset offset label zona ke posisi dasar (window.__zoneBase / map base): nol-kan
// akumulasi antiY/antiX dan kembalikan posisi ke base. Dipakai toggleNames (off/on)
// dan teamAction('work') — sebelumnya 3 salinan inline identik di OfficeScene.js.
// zones: [{ref, base, antiY, antiX, visible}]; return jumlah zona di-reset.
export function resetZoneBaseOffsets(zones) {
  if (!zones) return 0;
  let n = 0;
  zones.forEach(z => {
    if (!z || !z.ref) return;
    z.ref.userData.antiY = 0; z.ref.userData.antiX = 0;
    if (z.base) {
      z.ref.position.y = z.base.y; z.ref.position.x = z.base.x;
      z.ref.userData.baseY = z.base.y; z.ref.userData.baseX = z.base.x;
      const baseZ = z.base.z !== undefined ? z.base.z : z.ref.userData.baseZ;
      if (baseZ !== undefined) {
        z.ref.position.z = baseZ;
        z.ref.userData.baseZ = baseZ;
      }
    }
    if (z.visible !== undefined) z.ref.visible = z.visible;
    n++;
  });
  return n;
}
