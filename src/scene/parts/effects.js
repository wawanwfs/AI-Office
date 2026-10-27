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

// Throttle redraw jam dinding: drawClock menggambar ulang canvas 96×96 + upload
// tekstur SETIAP frame (~60×/dtk), padahal hanya jarum detik yang berubah dan
// itu cukup ~3×/dtk (jarum detik bergerak dalam diskrit per detik pada render).
export const CLOCK_REDRAW_EVERY = 20;
export function shouldRedrawClock(frame, every = CLOCK_REDRAW_EVERY) {
  return Number.isFinite(frame) && frame % every === 0;
}

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
// Murni: geser satu partikel debu (dipakai loop dust + unit test).
// Mengembalikan Y baru (respawn ke 0.5 bila melewati 3.6).
export function dustY(x, y, elapsed, i) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(elapsed) || !Number.isFinite(i)) return 0.5;
  const ny = y + Math.cos(elapsed * .4 + i * .5) * .0003;
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

export function drawScreenFrame(s, frame) {
  const { ctx: c, canvas: cv, type, hex } = s;
  const w = cv.width, h = cv.height, t = frame * 0.02;
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
      const b = put(0.22, 0.03, 0.16, 0x2f3236, d.x - 0.5, 0.82, d.z - 0.1); b.rotation.z = 0.15;
      [-1, 1].forEach((s) => put(0.07, 0.09, 0.09, 0x1d1f22, d.x - 0.5 + s * 0.11, 0.8, d.z - 0.1));
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
