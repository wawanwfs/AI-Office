// Efek visual WFS Project: layar monitor, dokumen melayang, detail meja, tema waktu.
// Ditulis ulang: tiap layar = fungsi renderer terpisah dalam tabel, bukan rangkaian if/else.
import { tvPct } from './tv_canvas.js';

const GRID = (c, w, h, step, col, alpha) => {
  c.strokeStyle = col; c.globalAlpha = alpha; c.lineWidth = 0.5;
  for (let x = step; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = step; y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
};

// Setiap renderer: (ctx, w, h, t, warna) → menggambar satu frame.
export const SCREEN_RENDERERS = {
  // AI/CS: gelembung chat bergantian
  lead(c, w, h, t, col) {
    for (let i = 0; i < 4; i++) {
      const mine = i % 2 === 0, y = 8 + i * 17;
      const fill = Math.min(1, Math.max(0.2, Math.sin(t * 1.4 + i) * 0.4 + 0.7));
      c.globalAlpha = 0.25 * fill + 0.15; c.fillStyle = col;
      const bw = 40 + ((i * 17) % 30);
      c.fillRect(mine ? 8 : w - 8 - bw, y, bw, 11);
    }
    c.globalAlpha = 0.8; c.fillStyle = col;
    if (Math.sin(t * 5) > 0) c.fillRect(10, h - 10, 4, 6);
  },
  // Grafik batang + garis tren
  charts(c, w, h, t, col) {
    c.fillStyle = col; c.globalAlpha = 0.5;
    for (let i = 0; i < 7; i++) {
      const bh = 8 + Math.abs(Math.sin(t * 0.9 + i * 0.7)) * 38;
      c.fillRect(8 + i * 16, h - 8 - bh, 11, bh);
    }
    c.strokeStyle = col; c.globalAlpha = 0.85; c.lineWidth = 1.4; c.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const y = 20 + Math.sin(x * 0.05 + t) * 10;
      x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  },
  // Terminal: baris log mengalir
  terminal(c, w, h, t, col) {
    const lines = ['$ npm run build', 'compiling...', 'ok  api/orders', 'ok  api/tasks', 'GET /health 200', 'deploy wfs-hq', 'tests: 9 passed', 'idle'];
    c.font = '6px monospace'; c.fillStyle = col;
    const off = Math.floor(t * 3);
    for (let i = 0; i < 9; i++) {
      c.globalAlpha = 0.35 + (i % 3) * 0.15;
      c.fillText(lines[(i + off) % lines.length], 5, 10 + i * 7);
    }
    if (Math.sin(t * 4) > 0) { c.globalAlpha = 0.9; c.fillRect(5, h - 9, 5, 6); }
  },
  // Desain: palet + lingkaran denyut
  palette(c, w, h, t, col) {
    ['#e879f9', '#fb7185', '#8b5cf6', '#60a5fa', '#22d3ee', '#4ade80'].forEach((cl, i) => {
      c.globalAlpha = 0.65; c.fillStyle = cl;
      c.fillRect(8 + (i % 3) * 38, 8 + Math.floor(i / 3) * 22, 31, 17);
    });
    c.globalAlpha = 0.5; c.strokeStyle = col; c.lineWidth = 1;
    c.beginPath(); c.arc(w / 2, h / 2 + 14, 11 + Math.sin(t * 1.5) * 4, 0, Math.PI * 2); c.stroke();
  },
  // Mobile: peta titik rute
  map(c, w, h, t, col) {
    GRID(c, w, h, 14, col, 0.2);
    c.globalAlpha = 0.7; c.fillStyle = col;
    [[26, 18], [64, 44], [98, 28], [48, 58]].forEach(([x, y], i) => {
      c.beginPath(); c.arc(x, y, 2.5 + Math.sin(t * 2 + i) * 0.8, 0, Math.PI * 2); c.fill();
    });
    c.strokeStyle = col; c.globalAlpha = 0.45; c.lineWidth = 1; c.beginPath();
    c.moveTo(26, 18); c.lineTo(64, 44); c.lineTo(98, 28); c.lineTo(48, 58); c.stroke();
  },
  // Deploy: progress bar + build number
  deploy(c, w, h, t, col) {
    c.fillStyle = col; c.globalAlpha = 0.18; c.fillRect(10, 10, w - 20, 11);
    c.globalAlpha = 0.65; c.fillRect(10, 10, (w - 20) * ((Math.sin(t * 0.6) + 1) / 2), 11);
    c.font = '6px monospace'; c.globalAlpha = 0.85;
    c.fillText('Deploy ke produksi', 10, 36);
    c.fillText('Build #' + (Math.floor(t * 2) % 900 + 100), 10, 47);
    c.fillStyle = '#4ade80'; c.fillText('✓ semua tes lolos', 10, 60);
  },
  // Dokumen: catatan teks
  docs(c, w, h, t, col) {
    c.globalAlpha = 0.09; c.fillStyle = '#fff'; c.fillRect(8, 8, w - 16, h - 16);
    c.font = '6px monospace'; c.fillStyle = col; c.globalAlpha = 0.65;
    ['# Catatan Desain', '', '> Sistem warna WFS', '  amber + navy', '', '## Komponen', '- Dock bawah', '- Papan task'].forEach((l, i) => c.fillText(l, 13, 19 + i * 7));
  },
  // Papan task Project Manager: progres live dari window.__tvData (data nyata
  // /wfs-project, di-refresh tvPull tiap 60 dtk). Tanpa data → indikator loading.
  board(c, w, h, t, col) {
    const T = (typeof window !== 'undefined' && window.__tvData?.tasks) || null;
    if (!T) {
      c.globalAlpha = 0.5; c.fillStyle = '#8fa3bd'; c.font = '6px monospace';
      c.fillText('papan task: memuat...', 6, h / 2);
      c.globalAlpha = 0.35; c.fillRect(6, h / 2 + 4, (w - 12) * (0.3 + 0.2 * Math.sin(t)), 4);
      return;
    }
    const pct = tvPct(T);
    c.globalAlpha = 0.85; c.fillStyle = col; c.font = '7px sans-serif';
    c.fillText('PAPAN TASK', 6, 11);
    c.globalAlpha = 0.2; c.fillRect(6, 14, w - 12, 6);
    c.globalAlpha = 0.9; c.fillRect(6, 14, Math.max(4, (w - 12) * pct / 100), 6);
    c.globalAlpha = 0.85; c.fillStyle = '#fff'; c.font = '6px monospace';
    // Guard anti-poisoning: done/total non-finite tidak boleh tampil sebagai NaN
    // di teks (pct sudah diamankan via tvPct; di sini nilai mentah dilemahkan).
    const doneN = Number.isFinite(T.done) ? T.done : 0;
    const totalN = Number.isFinite(T.total) ? T.total : 0;
    c.fillText(pct + '% · ' + doneN + '/' + totalN + ' task', 6, 30);
    c.globalAlpha = 0.5; c.fillStyle = col;
    c.fillText((T.review ? 'REVIEW: ' + T.review + '  ' : '') + (T.failed ? 'GAGAL: ' + T.failed : 'on track'), 6, 42);
    if (Math.sin(t * 2.5) > 0) { c.globalAlpha = 0.9; c.fillStyle = '#4ade80'; c.fillRect(w - 11, 6, 5, 5); } // dot live
  },
  // QA: daftar hasil tes
  bugs(c, w, h, t, col) {
    c.font = '6px monospace';
    [['PASS', col], ['PASS', '#4ade80'], ['FAIL', '#f87171'], ['PASS', col], ['RUN..', col]].forEach(([txt, cl], i) => {
      c.fillStyle = cl;
      c.globalAlpha = txt === 'RUN..' && Math.sin(t * 3) > 0 ? 0.3 : 0.75;
      c.fillText('● ' + txt, 9, 13 + i * 12);
      c.fillStyle = '#fff'; c.globalAlpha = 0.3; c.fillText('tes_' + (i + 1) + '.js', 58, 13 + i * 12);
    });
  },
};

// Throttle redraw layar: konten monitor (chat, chart, log) tidak perlu 60fps.
// 60fps × 14 tekstur canvas = boros CPU; ~10fps tetap halus untuk animasi lambat.
export const SCREEN_REDRAW_EVERY = 6;

// Throttle halaman melayang: 22 mesh (posisi + 3 rotasi + sin) di-update tiap
// frame padahal drift lambat → cukup ~20×/dtk; dt diakumulasi agar perpindahan
// per detik tetap identik dengan update per-frame.
const PAGES_UPDATE_INTERVAL = 1 / 20;

export function shouldRedrawScreen(frame, every = SCREEN_REDRAW_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}

// Throttle update peta bayangan: renderer merender shadow map penuh (2048² PCF)
// SETIAP frame padahal matahari statis & agen bergerak lambat → refresh ~6×/dtk
// menghemat satu render pass scene per frame tanpa bayangan tampak "melompat".
export const SHADOW_REFRESH_EVERY = 10;
export function shouldRefreshShadow(frame, every = SHADOW_REFRESH_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}

// Throttle pass anti-overlap label: sweep 5-pass × 14 label + label zona + bubble
// tiap frame → cukup ~15×/dtk (label bergerak lambat; offset anti-tumpuk disimpan
// di userData sehingga di antara tick posisi tetap benar).
export const LABEL_RELAYOUT_EVERY = 4;
export function shouldRelayoutLabels(frame, every = LABEL_RELAYOUT_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}

// ── Siklus 484: pass anti-overlap label ikut kontrak WAKTU-NYATA ────────────
// Gate lama frame-count (tiap 4 frame ≈ 15×/dtk @60FPS). Di GPU lambat frame
// ke-4 butuh 4–13 dtk → pasangan label bertumpuk tak di-relayout lama (damping
// sudah kontrak waktu sejak 251/263, tapi TICK relayout-nya masih frame-count).
export const LABEL_RELAYOUT_SEC = 4 / 60; // = LABEL_RELAYOUT_EVERY(4)/60 s @60FPS
export function labelRelayoutTimeGate() { return makeTimeGate(LABEL_RELAYOUT_SEC); }

// Throttle redraw jam dinding: drawClock menggambar ulang canvas 96×96 + upload
// tekstur SETIAP frame (~60×/dtk), padahal hanya jarum detik yang berubah dan
// itu cukup ~3×/dtk (jarum detik bergerak dalam diskrit per detik pada render).
export const CLOCK_REDRAW_EVERY = 20;
export function shouldRedrawClock(frame, every = CLOCK_REDRAW_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}

// ── Siklus 485: efek ambient ikut kontrak WAKTU-NYATA ──────────────────────
// Gate lama frame-count (tiap 3 frame ≈ 20×/dtk @60FPS). Di GPU lambat (Swift
// Shader 0.3–1.5 FPS) frame ke-3 butuh 2–13 dtk → ring denyut, visor, label
// duduk & animasi karakter beku lama. Kini gate waktu AMBIENT_SEC=3/60 s —
// paritas laju @60FPS identik dgn gate lama.
export const AMBIENT_SEC = 3 / 60;   // = AMBIENT_EVERY(3)/60 s @60FPS
export function ambientTimeGate() { return makeTimeGate(AMBIENT_SEC); }

// ── Siklus 485: bubble obrolan ikut kontrak WAKTU-NYATA ────────────────────
// Tick bubble lama frame-count (tiap 3 frame); fade/naik sudah kontrak waktu
// via akumulasi dt, tapi TICK-nya beku di GPU lambat → bubble muncul tapi
// diam/naik tersendat 2–13 dtk. Gate waktu BUBBLE_SEC=3/60 s (paritas @60FPS).
export const BUBBLE_SEC = 3 / 60;    // = BUBBLE_EVERY(3)/60 s @60FPS
export function bubbleTimeGate() { return makeTimeGate(BUBBLE_SEC); }

// Throttle kedip LED server room: 70+ LED di-update tiap frame padahal blink
// lambat (sin dengan sp 2–6 rad/s) → cukup ~20×/dtk, tak terlihat bedanya.
export const LED_UPDATE_EVERY = 3;
export function shouldUpdateLeds(frame, every = LED_UPDATE_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}
// Murni: opacity satu LED pada waktu elapsed (dipakai loop LED + unit test).
export function ledOpacity(L, elapsed) {
  if (!L || !Number.isFinite(elapsed) || !Number.isFinite(L.sp) || !Number.isFinite(L.ph) || !Number.isFinite(L.on)) return 0;
  return Math.sin(elapsed * L.sp + L.ph) > L.on ? 1 : 0.12;
}

// Throttle dust drift: 40 partikel (sin/cos per partikel) + upload buffer posisi
// GPU tiap frame padahal drift sangat lambat → cukup ~20×/dtk (tiap 3 frame).
export const DUST_UPDATE_EVERY = 3;
export function shouldUpdateDust(frame, every = DUST_UPDATE_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}
// ── Siklus 486: tick dust ikut kontrak WAKTU-NYATA (pola 481–485) ───────────
// Gate lama frame-count (tiap 3 frame ≈ 20×/dtk @60FPS). Di GPU lambat
// (SwiftShader 0.3–1.5 FPS) frame ke-3 butuh 2–10 dtk → drift debu beku walau
// laju per-tick sudah kontrak dt nyata (siklus 264). Kini gate waktu
// DUST_SEC=3/60 s — paritas laju @60FPS identik dgn gate lama.
export const DUST_SEC = 3 / 60; // = DUST_UPDATE_EVERY(3)/60 s @60FPS
export function dustTimeGate() { return makeTimeGate(DUST_SEC); }
// Murni: geser satu partikel debu — kontrak laju WAKTU-NYATA (siklus 264, bug
// kelas 251/259/260/261 keenam): dulu `y + cos(...)*.0003` KONSTAN per TICK —
// laju efektif bergantung penuh FPS (60 FPS = .006/dtk; SwiftShader 0.4 FPS dgn
// tick 0.05 dtk-sim = .0015/dtk-sim = 4× lebih lambat; unit test memanggil
// dustY manual = bebas-FPS). Kini dy = cos(...) × DUST_RATE × dt (dt =
// akumulasi waktu nyata antar tick di OfficeScene). Respawn >3.6 → 0.5 utuh.
// Guard anti-poisoning konsisten: input non-finite → 0.5; dt non-finite/≤0 →
// y utuh (tak bergerak).
export const DUST_RATE = 0.006; // unit/dtk — = .0003/tick × 20 tick/s @60FPS lama eksak
// Laju drift-X kontrak (siklus 264): lama .0006 × DUST_UPDATE_EVERY(3) per tick
// × 20 tick/s @60FPS = .036 unit/dtk × sin fase — kini eksak per detik nyata.
export const DUST_RATE_X = 0.036;
export function dustY(x, y, elapsed, i, dt = 1 / 20) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(elapsed) || !Number.isFinite(i)) return 0.5;
  if (!Number.isFinite(dt) || dt <= 0) return y;
  const ny = y + Math.cos(elapsed * .4 + i * .5) * DUST_RATE * dt;
  return ny > 3.6 ? 0.5 : ny;
}

// ── Efek ambient berbasis elapsed (dipakai animate(), diuji unit) ─────────
// Ambil nilai ambient sekaligus setiap kelipatan AMBIENT_EVERY frame: helm
// visor, ring denyut, label duduk, label NX — semuanya berosilasi pelan, tak
// perlu sin() 60×/dtk. Kembalikan objek agar animate() tinggal assign.
export const AMBIENT_EVERY = 3;

export function shouldUpdateAmbient(frame, every = AMBIENT_EVERY) {
  if (!Number.isFinite(frame) || !Number.isFinite(every) || every <= 0) return false;
  return frame % every === 0;
}

export function ambientFx(elapsed, i = 0) {
  if (!Number.isFinite(elapsed)) elapsed = 0;
  if (!Number.isFinite(i)) i = 0;
  return {
    ring: .12 + Math.sin(elapsed * 1.5) * .04,
    visor: .8 + Math.sin(elapsed * 3) * .2,
    label: Math.sin(elapsed * 1.1 + i * 1.3) * .02,
    nx: Math.sin(elapsed * 1.1 + 9) * .03,
  };
}

// ── Siklus 487: daun tanaman dekorasi ikut hidup (sway angin) ───────────────
// Murni & diuji unit: posisi dasar daun di-latch saat panggilan pertama
// (baseX/baseZ/baseY + fase per daun), lalu di-OSILASI kecil dgn elapsed waktu
// nyata — dipanggil di dalam gate ambient (siklus 485, kontrak waktu) sehingga
// di GPU lambat tetap hidup. Return jumlah daun yang di-update (0 = guard).
export function plantSway(elapsed, plants) {
  if (!Number.isFinite(elapsed) || !Array.isArray(plants)) return 0;
  let n = 0;
  plants.forEach((pl, pi) => {
    if (!pl || !Array.isArray(pl.leaves)) return;
    pl.leaves.forEach((lf, li) => {
      if (!lf || !lf.position) return;
      const u = lf.userData || (lf.userData = {});
      if (!Number.isFinite(u.baseY)) {
        u.baseX = Number.isFinite(lf.position.x) ? lf.position.x : 0;
        u.baseY = Number.isFinite(lf.position.y) ? lf.position.y : 0;
        u.baseZ = Number.isFinite(lf.position.z) ? lf.position.z : 0;
        u.ph = pi * 1.7 + li * 0.9;
      }
      const s = Math.sin(elapsed * 0.8 + u.ph);
      if (!Number.isFinite(s)) return;
      lf.position.x = u.baseX + s * 0.012;
      lf.position.z = u.baseZ + Math.cos(elapsed * 0.6 + u.ph) * 0.01;
      if (lf.rotation) lf.rotation.z = s * 0.06;
      n++;
    });
  });
  return n;
}

// ── Uap kopi espresso machine (siklus 488) ──
// Kepala uap naik + memudar secara berurutan (kolom uap), kontrak waktu-nyata.
// Murni & diuji unit; di-tick di dalam gate ambient (siklus 485).
export function coffeeSteam(elapsed, puffs) {
  if (!Number.isFinite(elapsed) || !Array.isArray(puffs)) return 0;
  let n = 0;
  const CYCLE = 2.4; // dtk per puff naik-dan-musnah
  puffs.forEach((p, i) => {
    if (!p || !p.position || !p.material) return;
    const ph = (i / puffs.length) * CYCLE;
    const t = ((elapsed + ph) % CYCLE) / CYCLE; // 0..1 dalam siklus
    if (!Number.isFinite(t)) return;
    // Latch posisi dasar panggilan pertama (pola plantSway 487)
    const u = p.userData || (p.userData = {});
    if (!Number.isFinite(u.baseY)) {
      u.baseX = Number.isFinite(p.position.x) ? p.position.x : 0;
      u.baseY = Number.isFinite(p.position.y) ? p.position.y : 0;
      u.baseZ = Number.isFinite(p.position.z) ? p.position.z : 0;
    }
    p.position.x = u.baseX + Math.sin(t * Math.PI * 2 + i) * 0.015; // goyangan tipis
    p.position.y = u.baseY + t * 0.35;                              // naik 0.35 unit
    p.material.opacity = 0.55 * (1 - t) * Math.min(1, t * 6);       // fade in cepat, fade out linier
    n++;
  });
  return n;
}

// ── Siklus cetak printer kantor (siklus 489) ──
// Dulu printer (L2) mati total: LED hijau MB statis & baki kertas tidak pernah
// bergerak — satu-satunya peralatan besar tersisa tanpa animasi hidup (setelah
// tanaman 487 & uap espresso 488).
// Kontrak waktu-nyata elapsed (pola 487/488): LED siap/aktif berkedip perlahan,
// kertas keluar naik bertahap dalam siklus 6 dtk (tahap idle→feed→eject).
export const PRINTER_CYCLE_SEC = 6;
export function printerCycle(elapsed, parts) {
  if (!Number.isFinite(elapsed) || !parts) return 0;
  let n = 0;
  const CYCLE = PRINTER_CYCLE_SEC;
  // LED siap (opacity 0.4..1 sin 0.8 Hz) — jika ada 2 LED, kedua berkedip lawan fase
  if (Array.isArray(parts.leds)) {
    parts.leds.forEach((led, i) => {
      if (!led || !led.material) return;
      const o = 0.7 + Math.sin(elapsed * (Math.PI * 2 / 5) + i * Math.PI) * 0.3;
      if (!Number.isFinite(o)) return;
      led.material.opacity = o;
      n++;
    });
  }
  // Kertas keluar: slot t = fase dalam siklus 6 dtk; 0-30% diam (memproses),
  // 30-100% kertas naik dari tray bawah ke atas (0 → 0.28 unit) lalu reset.
  const sheet = parts.sheet;
  if (sheet && sheet.position) {
    const u = sheet.userData || (sheet.userData = {});
    if (!Number.isFinite(u.baseY)) {
      u.baseY = Number.isFinite(sheet.position.y) ? sheet.position.y : 0;
    }
    const t = ((elapsed % CYCLE) + CYCLE) % CYCLE / CYCLE;
    if (!Number.isFinite(t)) return n;
    if (t < 0.3) {
      sheet.position.y = u.baseY;
      sheet.material && sheet.material.opacity !== undefined && (sheet.material.opacity = 0); // belum keluar
    } else {
      const k = (t - 0.3) / 0.7; // 0..1 progres eject
      sheet.position.y = u.baseY + k * 0.28;
      sheet.material && sheet.material.opacity !== undefined && (sheet.material.opacity = Math.min(1, k * 4));
    }
    n++;
  }
  return n;
}

// ── Gelembung air water cooler (siklus 490) ──
// Gelembung kecil naik dari dasar jug ke permukaan air lalu hilang, stagger
// fase per gelembung; kontrak waktu-nyata (pola coffeeSteam 488).
export function coolerBubbles(elapsed, bubbles, topY, bottomY, cycle) {
  if (!Number.isFinite(elapsed) || !Array.isArray(bubbles)) return 0;
  const T = Number.isFinite(topY) ? topY : 1.42;
  const B = Number.isFinite(bottomY) ? bottomY : 1.14;
  const CY = Number.isFinite(cycle) && cycle > 0 ? cycle : 1.8;
  let n = 0;
  bubbles.forEach((b) => {
    if (!b || !b.position || !b.material) return;
    const ph = Number.isFinite(b.userData && b.userData.phase) ? b.userData.phase : 0;
    const t = (((elapsed + ph) % CY) + CY) % CY / CY;
    if (!Number.isFinite(t)) return;
    b.position.y = B + t * (T - B);
    b.material.opacity = 0.7 * (1 - t) * Math.min(1, t * 6); // muncul cepat, memudar di permukaan
    n++;
  });
  return n;
}

// ── Kinematika animasi karakter duduk / rapat / resepsi ──
export function charMotion(elapsed, i = 0, mode = 'desk') {
  if (!Number.isFinite(elapsed)) elapsed = 0;
  if (!Number.isFinite(i)) i = 0;
  if (mode === 'meeting') {
    return {
      torsoY: Math.sin(elapsed * 1.5 + i) * 0.005,
      headRotY: Math.sin(elapsed * 0.7 + i * 1.3) * 0.08,
      headRotX: Math.sin(elapsed * 1.5 + i) * 0.02,
      handY: (side) => {
        const s = Number.isFinite(side) ? side : 1;
        return Math.sin(elapsed * 1.2 + s + i) * 0.003;
      },
    };
  }
  if (mode === 'reception') {
    return {
      torsoY: Math.sin(elapsed * 1.6) * 0.005,
      headRotY: Math.sin(elapsed * 0.4) * 0.03,
      headRotX: Math.sin(elapsed * 1.6) * 0.015,
      handY: (side) => {
        const s = Number.isFinite(side) ? side : 1;
        return Math.sin(elapsed * 8 + s * 2.5) * 0.007;
      },
    };
  }
  return {
    torsoY: Math.sin(elapsed * 1.8 + i) * 0.006,
    headRotY: Math.sin(elapsed * 0.5 + i * 1.1) * 0.035,
    headRotX: Math.sin(elapsed * 1.8 + i) * 0.015,
    handY: (side) => {
      const s = Number.isFinite(side) ? side : 1;
      return Math.sin(elapsed * 9 + s * 2.8 + i) * 0.008;
    },
  };
}

export function applyCharMotion(group, motion) {
  if (!group || !Array.isArray(group.children) || !motion) return;
  group.children.forEach((c) => {
    if (!c || !c.userData) return;
    if (c.userData.isTypeHand && typeof motion.handY === 'function') {
      const bY = Number.isFinite(c.userData.baseY) ? c.userData.baseY : c.position.y;
      c.position.y = bY + motion.handY(c.userData.side || 1);
    } else if (c.userData.isTorso && Number.isFinite(motion.torsoY)) {
      const bY = Number.isFinite(c.userData.baseY) ? c.userData.baseY : c.position.y;
      c.position.y = bY + motion.torsoY;
    } else if (c.userData.isHead) {
      if (c.rotation) {
        if (Number.isFinite(motion.headRotY)) c.rotation.y = motion.headRotY;
        if (Number.isFinite(motion.headRotX)) c.rotation.x = motion.headRotX;
      }
    }
  });
}

// Cincin denyut agent utama: fase (pulseT) & skala/opacity — murni agar bisa diuji.
export function pulseFx(elapsed) {
  if (!Number.isFinite(elapsed)) elapsed = 0;
  const phase = (elapsed * .5) % 1;
  return { phase, scale: 1 + phase * .3, opacity: .15 * (1 - phase) };
}

// Bubble obrolan dulu di-update TIAP frame padahal fade lambat (life 0→3.5 dtk).
// Throttle ~20×/dtk via akumulasi dt (pola sama dgn createDriftingPages): dt
// diakumulasi dan dipakai utuh sebagai step → laju fade/naik identik per detik.
export const BUBBLE_EVERY = 3;
export function shouldUpdateBubbles(frame, every = BUBBLE_EVERY) {
  return Number.isFinite(frame) && Number.isFinite(every) && every > 0 &&
    frame % every === 0;
}

export function drawScreenFrame(s, frame, elapsed) {
  const { ctx: c, canvas: cv, type, hex } = s;
  const w = cv.width, h = cv.height;
  // Siklus 264 (bug kelas 251 keenam): waktu animasi layar dulu `frame * 0.02`
  // — di 60 FPS = 1.2 dtk-animasi/dtk-nyata (pas), di SwiftShader 0.4 FPS =
  // 0.008 dtk-animasi/dtk (monitor praktis BEKU di kiosk), di 144 Hz = 2.88×
  // terlalu cepat. Kini `t` = detik WAKTU-NYATA (elapsed dari Timer scene,
  // akumulasi dt antar redraw) — laju animasi layar identik di FPS mana pun.
  // Guard anti-poisoning: elapsed non-finite → fallback kontrak lama frame*.02.
  const t = Number.isFinite(elapsed) ? elapsed : frame * 0.02;
  c.globalAlpha = 1; c.fillStyle = '#0b1220'; c.fillRect(0, 0, w, h);
  (SCREEN_RENDERERS[type] || SCREEN_RENDERERS.terminal)(c, w, h, t, hex);
  c.globalAlpha = 1; s.tex.needsUpdate = true;
}

// Dokumen melayang: gerak driftnya memakai gelombang bertumpuk, bukan driver acak per-sumbu.
export function createDriftingPages(ctx, count = 22) {
  const { THREE, office, rng } = ctx;
  const tints = [0x22d3ee, 0xfbbf24, 0x4ade80, 0xe879f9, 0x60a5fa, 0xfb923c, 0x8b5cf6, 0xf87171, 0xfff3d6];
  const pages = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(rng.r(0.12, 0.2), rng.r(0.15, 0.25)),
      new THREE.MeshLambertMaterial({ color: rng.pick(tints), side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    mesh.position.set(rng.r(-8, 6), rng.r(0.5, 3), rng.r(-6, 7));
    office.add(mesh);
    pages.push({
      mesh, y0: rng.r(1, 2.8), ph: rng.r(0, 6.28),
      vx: rng.r(0.15, 0.4) * (rng.n() > 0.5 ? 1 : -1), vz: rng.r(0.1, 0.3) * (rng.n() > 0.5 ? 1 : -1),
      spin: [rng.r(0.3, 1.2), rng.r(0.2, 0.8), rng.r(0.1, 0.6)],
    });
  }
  return {
    pages,
    update(dt, elapsed) {
      if (pages.__acc === undefined) pages.__acc = 0;
      pages.__acc += dt;
      if (pages.__acc < PAGES_UPDATE_INTERVAL) return; // throttle ~20×/dtk
      const step = pages.__acc; // pakai akumulasi dt → perpindahan sama dengan update per frame
      pages.__acc = 0;
      pages.forEach((p) => {
        const m = p.mesh;
        m.position.x += p.vx * step; m.position.z += p.vz * step;
        m.position.y = p.y0 + Math.sin(elapsed * 0.9 + p.ph) * 0.35;
        m.rotation.x += p.spin[0] * step; m.rotation.y += p.spin[1] * step;
        m.rotation.z += Math.sin(elapsed * 3 + p.ph) * 0.1 * step;
        if (m.position.x > 10) m.position.x = -10; else if (m.position.x < -10) m.position.x = 10;
        if (m.position.z > 8) m.position.z = -7; else if (m.position.z < -7) m.position.z = 8;
      });
    },
  };
}

// Detail kecil di meja: tanaman mini & headphone
export function addDeskTrinkets(ctx, desks) {
  const { THREE, office, M, rng } = ctx;
  const put = (w, h, d, col, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col)); m.position.set(x, y, z); office.add(m); return m; };
  desks.forEach((d, i) => {
    if (i % 2 === 0) {
      put(0.09, 0.09, 0.09, 0xc4b5ae, d.x - 0.55, 0.8, d.z + 0.2);
      for (let l = 0; l < 2; l++) put(0.06, 0.1 + rng.r(0, 0.06), 0.06, 0x57a85b, d.x - 0.55 + rng.r(-0.02, 0.02), 0.88 + l * 0.07, d.z + 0.2);
    }
    if (i % 2 === 0 && i < 8) {
      // headphone set: band + 2 earcup — semua mesh diberi basis Y (__hpBasis)
      // agar ikut terangkat bersama via headphonePick (siklus 517).
      const tagHp = (m) => { (m.userData = m.userData || {}).__hpBasis = m.position.y; return m; };
      tagHp(put(0.22, 0.03, 0.16, 0x2f3236, d.x - 0.5, 0.82, d.z - 0.1)).rotation.z = 0.15;
      [-1, 1].forEach((s) => tagHp(put(0.07, 0.09, 0.09, 0x1d1f22, d.x - 0.5 + s * 0.11, 0.8, d.z - 0.1)));
    }
  });
}

// Stagger layar monitor: 14+ layar canvas dulu digambar BERSAMAAN di frame yang
// sama tiap SCREEN_REDRAW_EVERY (lonjakan CPU/frame). Layar ke-i hanya digambar
// bila frame ≡ (i mod SCREEN_REDRAW_EVERY) → beban menyebar merata, tiap layar
// tetap refresh dengan periode yang sama.
export function shouldRedrawScreenAt(frame, index, every = SCREEN_REDRAW_EVERY) {
  return Number.isFinite(frame) && Number.isFinite(index) &&
    ((frame + ((index % every) + every)) % every) === 0;
}

// Siklus 481 — kontrak refresh layar = WAKTU-NYATA, bukan frame count.
// Dulu pemilik loop (OfficeScene.animate) memanggil shouldRedrawScreenAt berbasis
// `frame`: di 60 FPS SCREEN_REDRAW_EVERY=6 → tiap layar refresh 10×/dtk, TAPI di
// GPU lambat (SwiftShader headless/kiosk 0.3–1.5 FPS) frame 6 butuh 4–20 DETIK —
// animasi monitor (chat, chart, log) terlihat BEKU padahal scene hidup.
// Kini gate waktu: tick layar ke-i hanya bila elapsed ≥ (i+1)×SCREEN_REDRAW_SEC/
// every sejak tick sebelumnya — kontrak laju (~10 refresh layar/dtk @SCREEN_
// REDRAW_EVERY=6) terjaga di FPS APA PUN, stagger antar-layar tetap menyebar
// beban (satu sub-slot layar per gate, bukan semua sekaligus).
// State per-pemanggil: {t0, idx} — dipanggil dgn state lama utk lanjut, atau
// tanpa state utk mulai. Pola identik jendela sampling perf_quality (waktu nyata).
export const SCREEN_REDRAW_SEC = 0.1; // interval refresh per layar @60FPS (= 6 frame, paritas gate lama)
export function screenTickGate(elapsed, index, st, every = SCREEN_REDRAW_EVERY,
  period = SCREEN_REDRAW_SEC) {
  if (!Number.isFinite(elapsed) || !Number.isFinite(index)) return st || null;
  const s = st || { t0: null, idx: null, adv: 0 };
  const slot = ((index % every) + every) % every; // fase layar dlm siklus
  if (s.t0 === null) { // mulai: fase ini menunggu giliran pertamanya
    s.t0 = elapsed; s.idx = slot; s.adv = 0; s.lastEl = elapsed;
    return s;
  }
  // Siklus 481: gate di-advance SEKALI per nilai elapsed (satu frame) —
  // pemanggil loop forEach layar memanggil fungsi ini per layar dgn elapsed
  // sama; tanpa memo, panggilan ke-2..N mengosongkan adv (dobel-advance).
  if (s.lastEl === elapsed) return s;
  const win = period / every; // sub-slot waktu satu layar
  // Catch-up — di FPS sangat rendah satu frame bisa melewati beberapa sub-slot
  // (dt 0.2 s @5 FPS vs win 0.1 s); SEMUA slot yang dilewati dihitung lewat
  // (s.adv) agar tidak ada fase yang bolong (layar tak pernah digambar ulang).
  // Cap every agar frame beku lama tidak loop raksasa.
  const adv = Math.min(Math.floor((elapsed - s.t0) / win), every);
  if (adv > 0) { s.t0 += adv * win; s.idx = (s.idx + adv) % every; s.adv = adv; }
  else s.adv = 0;
  s.lastEl = elapsed;
  return s;
}
// Layar ke-i digambar bila fase-nya LEWAT pada tick ini (slot aktif atau slot
// yang di-skip saat catch-up). Kontrak stagger: fase aktif = SATU per sub-slot
// waktu → beban menyebar; layar dgn fase sama (i dan i+every) tetap digambar
// bersama — paritas perilaku gate frame-count lama.
export function shouldRedrawScreenTime(elapsed, index, st, every = SCREEN_REDRAW_EVERY,
  period = SCREEN_REDRAW_SEC) {
  if (!Number.isFinite(elapsed) || !Number.isFinite(index)) return false;
  const s = screenTickGate(elapsed, index, st, every, period);
  if (!s || s.idx === null || !(s.adv > 0)) return false;
  const phase = ((index % every) + every) % every;
  for (let k = 0; k < s.adv; k++) {
    if (((s.idx - k) % every + every) % every === phase) return true;
  }
  return false;
}

// ── Siklus 482: LED & jam dinding ikut kontrak WAKTU-NYATA ──────────────────
// Kedua gate lama berbasis frame-count (LED tiap 3, jam tiap 20 frame). Di GPU
// lambat (SwiftShader 0.3–1.5 FPS) frame ke-3/ke-20 butuh 2–60 detik → LED
// kedip beku & jarum jam tidak bergerak walau waktu berjalan. Kini gate WAKTU:
// LED paritas ~20×/dtk (LED_UPDATE_SEC=0.05), jam paritas ~3×/dtk
// (CLOCK_REDRAW_SEC=1/3). Paritas laju @60FPS identik dgn gate lama.
const makeTimeGate = (sec) => {
  let t0 = null;
  return (elapsed) => {
    if (!Number.isFinite(elapsed)) return false;
    if (t0 === null) { t0 = elapsed; return false; }
    if (elapsed - t0 >= sec) { t0 += sec; return true; }
    return false;
  };
};

export const LED_UPDATE_SEC = 0.05;     // = LED_UPDATE_EVERY(3)/60 s @60FPS
export const CLOCK_REDRAW_SEC = 1 / 3;  // = CLOCK_REDRAW_EVERY(20)/60 s @60FPS
export function ledTimeGate() { return makeTimeGate(LED_UPDATE_SEC); }
export function clockTimeGate() { return makeTimeGate(CLOCK_REDRAW_SEC); }

// ── Siklus 483: refresh shadow map ikut kontrak WAKTU-NYATA ─────────────────
// Gate lama frame-count (tiap 10 frame ≈ 6×/dtk @60FPS). Di GPU lambat frame
// ke-10 butuh 3–30 dtk → bayangan agen beku lama sebelum refresh. Kini gate
// waktu SHADOW_REFRESH_SEC=1/6 — paritas laju @60FPS identik dgn gate lama.
export const SHADOW_REFRESH_SEC = 1 / 6;
export function shadowTimeGate() { return makeTimeGate(SHADOW_REFRESH_SEC); }

// ── Siklus 491: idle hidup robot BANTUIN AI ────────────────────────────────
// Robot asisten (agen 'BANTUIN AI') satu-satunya aktor yang benar-benar STATIS:
// mata LED menyala konstan, panel dada beku, lampu status & halo antena
// konstan — dibanding agen manusia yang sudah punya charMotion (napas/ketik/
// lirik). Di sini semua nilai murni waktu-nyata (elapsed), tanpa state → bisa
// diuji unit; penerapan ke mesh di gate ambient OfficeScene.
export const ROBOT_BLINK_SEC = 4.2;   // jeda antar kedip mata
export const ROBOT_BLINK_DUR = 0.14;  // lama mata tertutup
export const ROBOT_SCAN_SEC = 1.6;    // satu sapuan panel dada
export const ROBOT_STATUS_HZ = 1.1;   // kedip lampu status
export const ROBOT_BEACON_HZ = 0.8;   // napas halo antena

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Siklus 492: pedestal dasar kampus bernapas ────────────────────────────
// Glow rim cyan & lip emas pedestal statis konstan — elemen identitas dek
// kampus tak bergerak. Nilai murni waktu-nyata (elapsed), tanpa state →
// diuji unit; penerapan material di gate ambient OfficeScene.
export const PEDESTAL_GLOW_SEC = 3.4; // satu napas glow rim

export function pedestalBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  const w = (hz) => 0.5 + 0.5 * Math.sin(t * hz * Math.PI * 2);
  const glow = 0.55 + 0.4 * w(1 / PEDESTAL_GLOW_SEC);           // 0.55…0.95
  const lip = 0.35 + 0.2 * w(1 / (PEDESTAL_GLOW_SEC * 1.7));    // 0.35…0.55
  return { glow, lip };
}

// ── Siklus 493: lampu berdiri lounge berkedip hangat (lampFlicker) ─────────
// PointLight & shade lampu berdiri lounge (L2, sudut 11.2/8.6) konstan — cahaya
// mati seperti umum lampu tanpa filamen hidup. Nilai murni waktu-nyata
// (elapsed), tanpa state → diuji unit; penerapan di gate ambient OfficeScene.
export const LAMP_FLICKER_SEC = 5.2; // satu gelombang napas utama

export function lampFlicker(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  // Gelombang utama 5.2 dtk + mikro-flicker 1.9 dtk (lebih lambat 1.7× dari
  // gelombang utama tidak sinkron — pola pedestal 492) + jitter halus sinus
  // tinggi-frekuensi agar terasa seperti filamen, bukan metronom.
  const w = (hz) => 0.5 + 0.5 * Math.sin(t * hz * Math.PI * 2);
  const main = w(1 / LAMP_FLICKER_SEC);
  const micro = w(1 / (LAMP_FLICKER_SEC * 1.9 / 3)); // ≈1.73 dtk
  const jitter = Math.sin(t * 7.3 + Math.sin(t * 1.1) * 0.6) * 0.03;
  const intensity = 0.78 + 0.22 * main + 0.06 * (micro - 0.5) + jitter; // ~0.72…1.0
  const shade = 0.62 + 0.28 * main + 0.05 * (micro - 0.5); // 0.55…0.95, tak mati total
  return { intensity, shade };
}

export function robotIdle(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  // Mata: terbuka penuh, menutup cepat di ujung tiap siklus (ease in-out).
  const bp = ((t % ROBOT_BLINK_SEC) + ROBOT_BLINK_SEC) % ROBOT_BLINK_SEC;
  const closed = bp > ROBOT_BLINK_SEC - ROBOT_BLINK_DUR
    ? Math.sin(((bp - (ROBOT_BLINK_SEC - ROBOT_BLINK_DUR)) / ROBOT_BLINK_DUR) * Math.PI)
    : 0;
  const eyeScaleY = 1 - 0.88 * clamp01(closed);
  // Panel dada: satu titik terang menyapu bar 0→1→2 lalu jeda; tiap bar
  // menerima intensitas menurut jarak dari posisi sapuan.
  const sp = ((t % ROBOT_SCAN_SEC) + ROBOT_SCAN_SEC) % ROBOT_SCAN_SEC;
  const head = (sp / ROBOT_SCAN_SEC) * 3.6 - 0.3; // -0.3 … 3.3 (jeda di ujung)
  const chest = [0, 1, 2].map((i) => 0.38 + 0.62 * clamp01(1 - Math.abs(head - i) * 1.15));
  // Lampu status: kotak halus 1.1 Hz.
  const status = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * ROBOT_STATUS_HZ * Math.PI * 2));
  // Halo antena: napas pelan, tak pernah mati total.
  const antenna = 0.14 + 0.2 * (0.5 + 0.5 * Math.sin(t * ROBOT_BEACON_HZ * Math.PI * 2));
  return { eyeScaleY, chest, status, antenna };
}

// ── Siklus 494: glow strip resepsionis & layar monitor reception bernapas ──
// Gap visual terakhir di reception: strip teal di bawah meja (rcGlow) & glow
// layar monitor (rcScreenGlow) konstan penuh — elemen Brand WFS terlihat di
// zoom depan tapi mati tanpa napas (setelah robot 491 & lampu lounge 493).
export const RC_GLOW_SEC = 3.1;      // napas strip teal (tak sinkron dgn lampu 5.2)
export const RC_SCREEN_SEC = 2.3;    // flicker layar monitor

export function receptionGlow(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  const w = (hz) => 0.5 + 0.5 * Math.sin(t * hz * Math.PI * 2);
  // Strip teal: napas 0.55…1.0 — tak pernah padam total (identitas).
  const glow = 0.55 + 0.45 * w(1 / RC_GLOW_SEC);
  // Layar monitor: flicker tipis 0.82…1.0 (nuansa konten berubah, bukan mati).
  const screen = 0.82 + 0.18 * w(1 / RC_SCREEN_SEC);
  return { glow, screen };
}

// ── Siklus 495: LED neon deck & strip tangga bernapas (deckNeonBreath) ──
// Elemen brand terakhir yang statis: ledLines (tepi L2/L3 + riser vertikal,
// 0x00F0FF) & stepStrips (hidung anak tangga, 0x00E5FF). Keduanya diberi
// napas opacity berbeda fase — tak pernah padam total (identitas neon kampus).
export const DECK_LED_SEC = 2.9;    // gelombang ledLines (tepi deck)
export const STEP_STRIP_SEC = 2.1;  // gelombang stepStrips (tangga) — rasio tak sinkron

export function deckNeonBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  return {
    led: w(DECK_LED_SEC),   // 0…1 — dipetakan 0.45…1.0 di caller
    step: w(STEP_STRIP_SEC),
  };
}

// ── Siklus 497: downlight arsitektural dek bernapas (downlightBreath) ──
// Tiga PointLight downlight L1/L2/L3 (terraces) konstan — intensitas hanya
// di-set setMode, tanpa napas antar pergantian mode. Faktor murni waktu-nyata
// (elapsed), per lantai dgn rasio tak sinkron; caller mengalikan dgn base
// mode (userData.base dari setMode) → tidak mengubah kalibrasi day/night.
// Rentang 0.78…1.0 — tak pernah padam (pencahayaan arsitektural).
export const DOWNLIGHT_SEC = 4.6; // gelombang dasar L1; L2/L3 rasio tak sinkron

export function downlightBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  return {
    l1: 0.78 + 0.22 * w(DOWNLIGHT_SEC),
    l2: 0.78 + 0.22 * w(DOWNLIGHT_SEC * 1.35),
    l3: 0.78 + 0.22 * w(DOWNLIGHT_SEC * 0.62),
  };
}
// ── Siklus 496: logo WFS & sorot dinding belakang bernapas (wallLogoBreath) ──
// Logo besar (identitas utama dinding belakang, terlihat di zoom home) & tiga
// bulb lampu sorotnya konstan penuh — elemen brand terakhir yang statis (setelah
// deck neon 495). Bulb berkedip hangat, cahaya PointLight mengikuti, logo
// bernapas lembut 0.6…1.0 — tak pernah padam total.
export const LOGO_BULB_SEC = 1.9;   // kedip bulb (rasio tak sinkron dgn lampu 5.2)
export const LOGO_GLOW_SEC = 3.7;   // napas logo

export function wallLogoBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const bulb = 0.72 + 0.28 * w(LOGO_BULB_SEC);   // 0.72…1.0
  return {
    bulb,                                        // dipetakan ke bulb & spot
    glow: 0.6 + 0.4 * w(LOGO_GLOW_SEC),          // 0.6…1.0 — tak padam
  };
}

// ── Siklus 498: lampu ruang server berdenyut AC (serverHum) ─────────────────
// PointLight cyan ruang server (0x00BCD4, intensitas .55 konstan) & bulb-nya
// mati rata — nuansa ruang server = denyut lembut seperti kompresor AC berhum.
// Nilai murni waktu-nyata (elapsed) → diuji unit; penerapan di gate ambient.
// Rentang 0.78…1.0 — tak pernah padam (ruang harus tetap terbaca), gelombang
// utama 3.9 dtk + mikro 1.43 dtk (rasio tak sinkron, pola lampFlicker 493).
export const SERVER_HUM_SEC = 3.9; // gelombang utama denyut AC

export function serverHum(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(SERVER_HUM_SEC);
  const micro = w(SERVER_HUM_SEC * 2.73); // ≈1.43 dtk — rasio tak sinkron
  return 0.78 + 0.18 * main + 0.04 * micro; // 0.78…1.0, tak padam
}

// ── Siklus 502: lampu tabung plafon bernapas (tubeLightBreath) ───────────────
// Lima tube mesh plafon (0x334466, opacity .3) konstan — elemen langit-langit
// terakhir yang beku (setelah 13 efek cahaya 492–501). Napas halus 0.55…1.0
// siklus 5.6 dtk (tak sinkron dgn lampu 5.2/4.3/3.9). Dipakai HANYA mode siang
// (guard !cyberpunkMode — mode neon set opacity 0.95 sendiri via NEON).
export const TUBE_LIGHT_SEC = 5.6;

export function tubeLightBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(TUBE_LIGHT_SEC);
  const micro = w(TUBE_LIGHT_SEC * 2.33); // ≈2.4 dtk — rasio tak sinkron
  return 0.55 + 0.38 * main + 0.07 * micro; // 0.55…1.0, tak padam
}

// ── Siklus 499: lampu ambience lantai dasar bernapas (floorLampBreath) ──────
// PointLight hangat area kerja L1 (decor.loungeLight, 0xFFC97A, .9 konstan) —
// satu-satunya sumber cahaya area kerja yang masih statis (setelah lampu
// berdiri lounge L2 493, downlight dek 497, ruang server 498). Nilai murni
// waktu-nyata (elapsed) → diuji unit; penerapan di gate ambient OfficeScene.
// Rentang 0.76…1.0 — tak pernah padam, gelombang utama 4.3 dtk + mikro 1.5 dtk
// (rasio 2.87× tak sinkron, pola lampFlicker 493 / serverHum 498).
export const FLOOR_LAMP_SEC = 4.3; // gelombang utama napas lampu L1

export function floorLampBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(FLOOR_LAMP_SEC);
  const micro = w(FLOOR_LAMP_SEC * 2.87); // ≈1.5 dtk — rasio tak sinkron
  return 0.76 + 0.20 * main + 0.04 * micro; // 0.76…1.0, tak padam
}

// ── Siklus 500: lampu glow resepsionis bernapas (receptionLightBreath) ──────
// PointLight biru bawah meja resepsionis (rcLight, 0x4D9FFF, .4 konstan) —
// sumber cahaya statis terakhir (setelah floorLampBreath 499). Nilai murni
// waktu-nyata (elapsed) → diuji unit; penerapan di gate ambient OfficeScene.
// Rentang 0.74…1.0 — tak pernah padam (resepsi harus tetap terbaca), gelombang
// utama 3.6 dtk + mikro 1.64 dtk (rasio 2.2× tak sinkron, pola 493/498/499).
export const RECEPTION_LIGHT_SEC = 3.6; // gelombang utama napas lampu resepsi

// ── Siklus 503: lampu gantung meja bernapas (pendantBreath) ────────────────
// 26 lampu gantung industri di atas meja (bulb 0xFFF3D6 + PointLight 0.15)
// konstan — elemen pencahayaan meja terakhir yang beku (setelah tube 502).
// Rentang 0.70…1.0 — tak pernah padam, gelombang utama 4.7 dtk + mikro 1.9 dtk
// (rasio ≈2.47× tak sinkron vs 5.2/4.3/3.9/3.6/5.6/2.9).
export const PENDANT_SEC = 4.7; // gelombang utama napas lampu gantung

export function pendantBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(PENDANT_SEC);
  const micro = w(PENDANT_SEC * 2.47); // ≈1.9 dtk — rasio tak sinkron
  return 0.70 + 0.24 * main + 0.06 * micro; // 0.70…1.0, tak padam
}

export function receptionLightBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(RECEPTION_LIGHT_SEC);
  const micro = w(RECEPTION_LIGHT_SEC * 2.2); // ≈1.64 dtk — rasio tak sinkron
  return 0.74 + 0.22 * main + 0.04 * micro; // 0.74…1.0, tak padam
}

// ── Siklus 504: panel plafon recessed bernapas (panelBreath) ────────────────
// Lima PointLight putih jalur tengah plafon (0xFFFFFF, 0.35, y=3.8) konstan —
// elemen pencahayaan plafon terakhir yang beku (setelah pendant 503). Napas
// halus 0.80…1.0, gelombang utama 6.1 dtk + mikro 2.2 dtk (rasio ≈2.77× tak
// sinkron vs 5.2/4.3/3.9/3.6/5.6/4.7/2.9) — tak pernah padam. Dipakai HANYA
// mode siang (mode neon set 0.03 via NEON.panelLight — jangan ditimpa).
export const PANEL_BREATH_SEC = 6.1; // gelombang utama napas panel

export function panelBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(PANEL_BREATH_SEC);
  const micro = w(PANEL_BREATH_SEC * 2.77); // ≈2.2 dtk — rasio tak sinkron
  return 0.80 + 0.17 * main + 0.03 * micro; // 0.80…1.0, tak padam
}

// ── Siklus 505: kafe — glow kulkas snack & LED espresso bernapas (cafeGlow) ──
// Dua aksen brand kafe masih beku (setelah uap espresso 488): glow panel kulkas
// snack (fridgeGlow 0x4FC3F7, MB konstan) & lampu status mesin espresso (emG
// 0x10E5A0). Napas kulkas 0.60…1.0 siklus 3.3 dtk (dingin, pelan) + LED siap
// flicker cepat 0.55…1.0 siklus 1.3 dtk (rasio ≈2.54× tak sinkron vs semua
// siklus lampu lain) — keduanya tak pernah padam total.
export const FRIDGE_GLOW_SEC = 3.3;  // napas glow kulkas snack
export const ESPRESSO_LED_SEC = 1.3; // kedip lampu siap mesin espresso

export function cafeGlowBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(FRIDGE_GLOW_SEC);
  const micro = w(FRIDGE_GLOW_SEC * 2.54); // ≈1.3 dtk — LED espresso
  return {
    fridge: 0.60 + 0.34 * main + 0.06 * micro, // 0.60…1.0, tak padam
    led: 0.55 + 0.38 * w(ESPRESSO_LED_SEC) + 0.07 * micro, // 0.55…1.0
  };
}

// ── Siklus 508: lampu wajah layar meja 26 agen bernapas (screenGlowBreath) ──
// Setiap meja punya PointLight warna agen (0.35 konstan, sLight di buildDesk)
// — cahaya terakhir yang masih beku (setelah 12 efek cahaya/plakat 492–507).
// Berkedip halus seperti layar aktif: 0.78…1.0, gelombang utama 3.4 dtk +
// mikro 1.42 dtk (rasio 2.61× tak sinkron vs 11 siklus lain), stagger fase
// 0.37 dtk per agen agar layar bergantian hidup — tak pernah padam.
export const SCREEN_GLOW_SEC = 3.4;    // gelombang utama layar
export const SCREEN_STAGGER_SEC = 0.37; // jeda fase per agen

export function screenGlowBreath(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const idx = Number.isFinite(i) ? i : 0;
  const tt = t + idx * SCREEN_STAGGER_SEC;
  const w = (sec) => 0.5 + 0.5 * Math.sin((tt / sec) * Math.PI * 2);
  const main = w(SCREEN_GLOW_SEC);
  const micro = w(SCREEN_GLOW_SEC * 2.61); // ≈1.42 dtk — rasio tak sinkron
  return 0.78 + 0.17 * main + 0.05 * micro; // 0.78…1.0, tak padam
}

// ── Siklus 507: plakat lantai L1/L2/L3 bernapas (badgeBreath) ──────────────
// Tiga plakat arsitektural (LEVEL 01/02/03, canvas 640×112 + stroke aksen)
// ditampilkan opasitas konstan — plat brand terakhir yang beku. Napas halus
// 0.82…1.0 gelombang utama 2.7 dtk + mikro 6.83 dtk (rasio 2.53× tak sinkron
// vs 10 siklus lain), stagger fase 0.9 dtk per plakat agar bergantian hidup.
export const BADGE_BREATH_SEC = 2.7;   // gelombang utama napas plakat
export const BADGE_STAGGER_SEC = 0.9;  // jeda fase antar plakat

export function badgeBreath(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const idx = Number.isFinite(i) ? i : 0;
  const tt = t + idx * BADGE_STAGGER_SEC;
  const w = (sec) => 0.5 + 0.5 * Math.sin((tt / sec) * Math.PI * 2);
  const main = w(BADGE_BREATH_SEC);
  const micro = w(BADGE_BREATH_SEC * 2.53); // ≈6.83 dtk — rasio tak sinkron
  return 0.82 + 0.15 * main + 0.03 * micro; // 0.82…1.0, tak padam
}

// ── Siklus 506: strip cahaya tepi rak server bernapas (rackEdgeBreath) ──
// Enam strip vertikal cyan (0x00E5FF, MB konstan) di muka 3 rak server masih
// statis (setelah lampu ruang server 498 & LED unit yang sudah berkedip acak).
// Napas 0.50…1.0 gelombang utama 3.1 dtk + mikro 1.29 dtk (rasio 2.41× tak
// sinkron vs 9 siklus lain) — tak pernah padam total (identitas rak hidup).
export const RACK_EDGE_SEC = 3.1; // gelombang utama napas strip tepi

export function rackEdgeBreath(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(RACK_EDGE_SEC);
  const micro = w(RACK_EDGE_SEC * 2.41); // ≈1.7 dtk — rasio tak sinkron
  return 0.50 + 0.42 * main + 0.08 * micro; // 0.50…1.0, tak padam
}

// ── Siklus 509: poster motivasi dinding bernapas (posterBreath) ────────────
// 10 poster dinding (8 slogan samping/belakang/depan di furniture.js + 2 besar
// di decor.js) tampil opasitas penuh konstan — dekorasi dinding terakhir yang
// beku (setelah plakat 507). Napas halus 0.84…1.0 gelombang utama 3.35 dtk +
// mikro 9.11 dtk (rasio 2.72× tak sinkron vs 13 siklus lain), stagger fase
// 0.41 dtk per poster agar slogan bergantian "menyala" — tak pernah pudar habis.
export const POSTER_BREATH_SEC = 3.35;   // gelombang utama napas poster
export const POSTER_STAGGER_SEC = 0.41;  // jeda fase antar poster

export function posterBreath(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const idx = Number.isFinite(i) ? i : 0;
  const tt = t + idx * POSTER_STAGGER_SEC;
  const w = (sec) => 0.5 + 0.5 * Math.sin((tt / sec) * Math.PI * 2);
  const main = w(POSTER_BREATH_SEC);
  const micro = w(POSTER_BREATH_SEC * 2.72); // ≈9.11 dtk — rasio tak sinkron
  return 0.84 + 0.13 * main + 0.03 * micro; // 0.84…1.0, tak pudar habis
}

// ── Siklus 510: rak buku "hidup" — buku sesekali meluncur keluar & kembali ──
// Rak buku dinding kiri belakang (bookshelf.js, ~40 buku warna acak) sepenuhnya
// statis — dekorasi interior terakhir yang beku (setelah poster 509). Efek
// bookNudge(elapsed, i): tiap buku punya siklus panjang ACAK-deterministik
// (hash i) di dalam slot waktu global; dalam slot aktifnya buku meluncur keluar
// (sumbu Z lokal rak = X dunia) ~0.09 unit lalu kembali — seperti diambil-ditaruh
// oleh agen. Tak sinkron antar buku & vs 14 siklus lain (fase hash × golden).
export const BOOK_CYCLE_SEC = 37.0;   // periode slot global semua buku
export const BOOK_STAGGER_SEC = 0.9;  // panjang gerakan keluar-masuk per buku

// hash kecil deterministik 0…1 dari indeks buku (bukan Math.random — replays uji)
const bookHash = (i) => {
  const x = Math.sin((Number.isFinite(i) ? i : 0) * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function bookNudge(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  const idx = Number.isFinite(i) ? i : 0;
  const h = bookHash(idx);
  // fase personal: offset slot hash → buku aktif di detik berbeda dlm slot global
  const phase = ((t / BOOK_CYCLE_SEC) + h) % 1;
  // hanya sebagian kecil slot aktif (≈ 1 dari ~7 buku per slot): ambang hash
  if (h > 0.15) return 0;
  // gerakan keluar-masuk dalam slot: sin setengah-siklus → 0 → 1 → 0
  const s = Math.sin(phase * Math.PI * 2);
  const nudge = Math.max(0, s) * Math.max(0, s) * (s > 0 ? 1 : 0); // smooth 0…1
  return 0.09 * clamp01(nudge);
}

// ── Siklus 511: trofi helm meja utama & cincin lantai lead bernapas (trophyPulse) ──
// Elemen brand meja agent lead terakhir yang beku (setelah buku 510): visor helm
// trofi (0x4D9FFF), PointLight helm, floorRing & ringInner (2 cincin 0x4D9FFF)
// semuanya opasitas/intensitas konstan. trophyPulse(elapsed): visor berdenyut
// seperti beacon 0.45…1.0 gelombang utama 2.6 dtk + mikro 8.6 dtk (rasio 3.31×
// tak sinkron vs 15 siklus lain); cincin luar pakai denyut lambat terpisah
// ringBreath 0.10…0.20 (6.9 dtk, rasio 2.66×) agar lantai "bernapas" pelan tak
// menarik perhatian — tak pernah padam total (identitas brand biru lead desk).
export const TROPHY_PULSE_SEC = 2.6;    // denyut utama visor + light helm
export const TROPHY_RING_SEC = 6.9;     // napas lambat cincin lantai

export function trophyPulse(elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const w = (sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
  const main = w(TROPHY_PULSE_SEC);
  const micro = w(TROPHY_PULSE_SEC * 3.31); // ≈8.606 dtk — rasio tak sinkron
  return {
    visor: 0.45 + 0.47 * main + 0.08 * micro,   // 0.45…1.0, beacon helm
    ring: 0.10 + 0.075 * main + 0.025 * micro,  // 0.10…0.20, cincin luar
    ringIn: 0.05 + 0.03 * w(TROPHY_RING_SEC),   // 0.05…0.08, cincin dalam
  };
}

// ── Siklus 512: patch warna zona lantai bernapas (zoneBreath) ──
// 5 patch zona (DEV DESK, MEETING, WELCOME & LOUNGE, CAFÉ, SERVER ROOM) punya
// opasitas konstan — area warna terakhir yang beku (setelah trofi 511).
// zoneBreath(elapsed, i): napas halus 0.82…1.0 × basis opasitas zona, gelombang
// utama 3.2 dtk + mikro 8.32 dtk (rasio 2.6× tak sinkron vs 16 siklus lain),
// stagger fase 0.55 dtk per zona agar bergantian hidup. Tak pernah padam
// (fungsional: penanda area) — cukup halus agar tak melelahkan mata.
export const ZONE_BREATH_SEC = 3.2; // gelombang utama napas zona

export function zoneBreath(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0; // netral (sin 0 → 0.5)
  const idx = Number.isFinite(i) ? i : 0;
  const w = (sec) => 0.5 + 0.5 * Math.sin(((t - idx * 0.55) / sec) * Math.PI * 2);
  const main = w(ZONE_BREATH_SEC);
  const micro = w(ZONE_BREATH_SEC * 2.6); // ≈8.32 dtk — rasio tak sinkron
  return 0.82 + 0.13 * main + 0.05 * micro; // 0.82…1.0
}

// ── Siklus 513: majalah di meja lounge & sofa sesekali "dibaca" (magTilt) ──
// 5 majalah flat (3 di magRack lounge + 2 di sofa L3) condong konstan 0° —
// benda terakhir di area santai yang beku (setelah rak buku 510). Efek
// magTilt(elapsed, i): tiap majalah sesekali terangkat & terbuka sedikit
// (rotasi Z lokal 0 → −0.18 rad = diangkat-dibaca) lalu kembali rata — pola
// bookNudge 510: slot global panjang + fase hash deterministik, hanya sebagian
// kecil aktif per slot (≈15%), tak sinkron antar majalah & vs 17 siklus lain.
export const MAG_CYCLE_SEC = 29.0;   // periode slot global semua majalah
export const MAG_TILT_RAD = 0.18;    // sudut angkat maksimum majalah

// ── Siklus 514: cangkir kafe sesekali "diambil-diminum" (cupLift) ──
// 3 cangkir di counter kafe (cafe.js) tergeletak konstan — benda terakhir di
// area kafe yang beku (setelah uap espresso 488 & glow kulkas 505). Efek
// cupLift(elapsed, i): tiap cangkir sesekali terangkat 0 → 0.045 unit (diambil)
// lalu kembali turun — pola magTilt 513: slot global panjang + fase hash
// deterministik, hanya sebagian kecil aktif per slot (≈25%), tak sinkron antar
// cangkir & vs 18 siklus lain (slot 41 dtk ≠ mag 29, buku 37, poster 3.35).
export const CUP_CYCLE_SEC = 41.0;   // periode slot global semua cangkir
export const CUP_LIFT_UP = 0.045;    // tinggi angkat maksimum cangkir

// hash kecil deterministik 0…1 dari indeks (bukan Math.random — replays uji aman)
const cupHash = (i) => {
  const x = Math.sin((Number.isFinite(i) ? i : 0) * 57.7 + 91.3) * 43758.5453;
  return x - Math.floor(x);
};

export function cupLift(elapsed, i = 0) {
  if (!Number.isFinite(elapsed)) return 0; // waktu rusak → netral total (guard eksplisit)
  if (!Number.isFinite(i)) return 0;       // indeks rusak → netral total
  const t = elapsed;
  const idx = i;
  const h = cupHash(idx);
  // fase personal: offset slot hash → cangkir aktif di detik berbeda dlm slot
  const phase = ((t / CUP_CYCLE_SEC) + h) % 1;
  // hanya sebagian kecil cangkir aktif per slot (≈25%)
  if (h > 0.25) return 0;
  // gerakan angkat-turun dalam slot: sin setengah-siklus → 0 → 1 → 0
  const s = Math.sin(phase * Math.PI * 2);
  const lift = Math.max(0, s) * Math.max(0, s); // smooth 0…1
  return CUP_LIFT_UP * lift;
}

// hash kecil deterministik 0…1 dari indeks (bukan Math.random — replays uji aman)
const magHash = (i) => {
  const x = Math.sin((Number.isFinite(i) ? i : 0) * 91.7 + 27.19) * 43758.5453;
  return x - Math.floor(x);
};

export function magTilt(elapsed, i = 0) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  const idx = Number.isFinite(i) ? i : 0;
  const h = magHash(idx);
  // fase personal: offset slot hash → majalah aktif di detik berbeda dlm slot
  const phase = ((t / MAG_CYCLE_SEC) + h) % 1;
  // hanya sebagian kecil majalah aktif per slot (≈15%)
  if (h > 0.15) return 0;
  // gerakan angkat-membaca dalam slot: sin setengah-siklus → 0 → 1 → 0
  const s = Math.sin(phase * Math.PI * 2);
  const lift = Math.max(0, s) * Math.max(0, s); // smooth 0…1
  return MAG_TILT_RAD * lift;
}

// ── Siklus 515: spidol whiteboard sesekali "diambil menulis" (markerPick) ──
// 4 spidol + penghapus di baki whiteboard rapat (room.js via markerItems)
// tergeletak konstan — benda terakhir di ruang meeting yang beku (setelah lampu
// gantung 503). Efek markerPick(elapsed, i): tiap spidol sesekali terangkat
// 0 → 0.03 unit (diambil menulis) lalu kembali ke baki — pola cupLift 514:
// slot global panjang + fase hash deterministik, hanya sebagian kecil aktif
// per slot (≈20%), tak sinkron antar spidol & vs 19 siklus lain (slot 33 dtk
// ≠ cup 41, mag 29, buku 37).
export const MARKER_CYCLE_SEC = 33.0;  // periode slot global semua spidol
export const MARKER_LIFT_UP = 0.03;    // tinggi angkat maksimum spidol

// hash kecil deterministik 0…1 dari indeks (bukan Math.random — replays uji aman)
const markerHash = (i) => {
  const x = Math.sin((Number.isFinite(i) ? i : 0) * 73.3 + 41.7) * 43758.5453;
  return x - Math.floor(x);
};

export function markerPick(elapsed, i = 0) {
  if (!Number.isFinite(elapsed)) return 0; // waktu rusak → netral total
  if (!Number.isFinite(i)) return 0;       // indeks rusak → netral total
  const h = markerHash(i);
  // fase personal: offset slot hash → spidol aktif di detik berbeda dlm slot
  const phase = ((elapsed / MARKER_CYCLE_SEC) + h) % 1;
  // hanya sebagian kecil spidol aktif per slot (≈20%)
  if (h > 0.2) return 0;
  // gerakan angkat-turun dalam slot: sin setengah-siklus → 0 → 1 → 0
  const s = Math.sin(phase * Math.PI * 2);
  const lift = Math.max(0, s) * Math.max(0, s); // smooth 0…1
  return MARKER_LIFT_UP * lift;
}

// ── Siklus 517: headphone meja sesekali "diambil-dipakai" (headphonePick) ──
// 8 set headphone di meja (addDeskTrinkets, meja genap < 8) tergeletak konstan
// — benda terakhir di area meja kerja yang beku. Efek headphonePick(elapsed, i):
// tiap set sesekali seluruh grup terangkat 0 → 0.05 unit (diambil-dipakai) lalu
// kembali ke meja — pola markerPick 515 / cupLift 514: slot global panjang +
// fase hash deterministik, hanya sebagian kecil aktif per slot (≈25%), tak
// sinkron antar set & vs 21 siklus lain (slot 47 dtk ≠ marker 33, cup 41,
// mag 29, buku 37).
export const HEADPHONE_CYCLE_SEC = 47.0;  // periode slot global semua headphone
export const HEADPHONE_LIFT_UP = 0.05;    // tinggi angkat maksimum set headphone

// hash kecil deterministik 0…1 dari indeks (bukan Math.random — replays uji aman)
const headphoneHash = (i) => {
  const x = Math.sin((Number.isFinite(i) ? i : 0) * 83.7 + 19.3) * 43758.5453;
  return x - Math.floor(x);
};

export function headphonePick(elapsed, i = 0) {
  if (!Number.isFinite(elapsed)) return 0; // waktu rusak → netral total
  if (!Number.isFinite(i)) return 0;       // indeks rusak → netral total
  const h = headphoneHash(i);
  // fase personal: offset slot hash → set aktif di detik berbeda dlm slot
  const phase = ((elapsed / HEADPHONE_CYCLE_SEC) + h) % 1;
  // hanya sebagian kecil set aktif per slot (≈25%)
  if (h > 0.25) return 0;
  // gerakan angkat-turun dalam slot: sin setengah-siklus → 0 → 1 → 0
  const s = Math.sin(phase * Math.PI * 2);
  const lift = Math.max(0, s) * Math.max(0, s); // smooth 0…1
  return HEADPHONE_LIFT_UP * lift;
}

// ── Siklus 518: papan menu kafe — highlight item berganti (menuHighlight) ──
// Kanvas menu WFS CAFÉ (sign_canvas.js drawMenuBoard) 100% statis: judul, 3
// baris menu, tak pernah berubah — satu-satunya kanvas kafe tanpa kehidupan
// (setelah uap 488, glow 505). Efek murni menuHighlight(elapsed): indeks item
// menu yang di-highlight berputar setiap MENU_HIGHLIGHT_SEC dtk (3 item →
// rotasi lambat seperti layar kasir); dipakai drawMenuBoard(elapsed) untuk
// menggambar baris ter-highlight lebih terang. Guard non-finite netral (0).
export const MENU_HIGHLIGHT_SEC = 3.2; // periode ganti highlight per item

export function menuHighlight(elapsed) {
  if (!Number.isFinite(elapsed)) return 0; // waktu rusak → item pertama
  const n = 3; // jumlah item menu kafe
  const idx = Math.floor(elapsed / MENU_HIGHLIGHT_SEC) % n;
  return ((idx % n) + n) % n; // aman utk elapsed negatif
}
