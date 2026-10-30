// Waktu, pencahayaan, mode neon, dan pergantian shift WFS Project.
import * as shiftSpec from './shift_spec.js';
import { drawSky, drawSkyNight } from './sky_canvas.js';
import { floorElevationAt } from './floor_elevation.js';

// ── Kurva waktu: menit → status teks & faktor siang (0 malam … 1 siang) ──
export const SCHEDULE = [
  [0, 'Shift malam · WFS online'],
  [360, 'Persiapan pagi'],
  [480, 'Tim mulai berdatangan'],
  [540, 'Fokus pagi'],
  [600, 'Stand-up pagi'],
  [630, 'Deep work · semua online'],
  [720, 'Istirahat makan siang'],
  [780, 'Fokus siang'],
  [840, 'Sprint review'],
  [870, 'Fokus sore'],
  [1020, 'Tim bersiap pulang'],
  [1140, 'Shift malam · WFS online'],
];

export function statusAt(minutes) {
  let label = SCHEDULE[0][1];
  for (const [from, text] of SCHEDULE) if (minutes >= from) label = text;
  return label;
}

// Faktor siang dengan transisi halus (smoothstep) pagi 06:00–08:00 dan sore 17:00–19:00
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function daylight(m) {
  if (m < 360) return 0.3;                              // dini hari
  if (m < 480) return 0.3 + 0.7 * smooth(360, 480, m);  // fajar → terang
  if (m < 1020) return 1;                               // jam kerja
  if (m < 1140) return 1 - 0.7 * smooth(1020, 1140, m); // senja
  return 0.3;                                           // malam
}

export function mixHex(a, b, t) {
  if (!Number.isFinite(t)) t = 0; // anti-poisoning: t non-finite → warna asal a (t=0), bukan NaN
  const ch = (v, s) => (v >> s) & 255;
  const mix = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function createLighting(ctx) {
  const { THREE, scene, renderer, sun, ambient, agentData, onTimeUpdate, onStatusUpdate, onTick, onTime } = ctx;
  const NAVY = 0x010a28;
  let current = 660;

  // ── Siklus 164: swap tekstur langit jendela siang↔malam ──
  // Dulu skyTex digambar sekali (siang): saat malam jendela tetap biru terang
  // + awan putih — kontras salah dgn latar NAVY. Canvas skyTex di-REPAINT dgn
  // langit malam/siang sesuai daylight → semua material (MeshBasicMaterial
  // map skyTex) ikut tanpa menyentuh scene graph. Opsional via ctx.skyWinCanvas
  // (dari structure.js); tanpa itu (unit test lama) swap dilewati, tanpa error.
  const skyCanvas = ctx.skyWinCanvas || null;
  let skyNight = false; // status paint aktif — hindari repaint di tiap tick
  function paintSkyNight(night) {
    if (!skyCanvas) return;
    if (skyNight === night) return;
    skyNight = night;
    const c2 = skyCanvas.getContext('2d');
    if (night) drawSkyNight(c2); else drawSky(c2);
    if (skyCanvas.__needsUpdate) skyCanvas.__needsUpdate();
  }

  // ── Siklus 165: dinding kantor ikut siang↔malam ──
  // Dinding atas & wainscot = MeshBasicMaterial (tidak bergantung pencahayaan)
  // dgn tekstur palet siang — tanpa ini dinding tetap terang penuh saat malam
  // (kelas bug sama dgn jendela). paintWallNight dari createWalls me-repaint
  // semua kanvas tekstur dinding dgn palet WALL_NIGHT; guard state terpisah
  // dgn sky (biar test/harness lama tanpa wallPainter tetap aman), idempoten.
  const wallRt = ctx.wallPainter || null;
  let wallNight = false;
  let wallReady = false; // createWalls menggambar tekstur siang saat init
  function paintWalls(night) {
    if (!wallRt || typeof wallRt.paintWallNight !== 'function') return;
    if (!wallReady) { wallReady = true; if (!night) return; } // sudah siang di kanvas — repaint siang tak perlu
    if (wallNight === night) return;
    wallNight = night;
    wallRt.paintWallNight(night);
  }

  // ── Siklus 166: TRIM & PILAR dinding ikut siang↔malam ──
  // Crown molding/sill putih (#F4F6FA) & pilar abu terang (#8E9BB0) = warna solid
  // MeshBasicMaterial statis — jam malam panel dinding sudah gelap (165) tapi lis &
  // pilar tetap menyala. paintTrimNight dari createWalls men-set warna semua mesh
  // tercatat (by reference — klon wall-fade ikut karena berbagi material). Guard
  // state terpisah, idempoten; ambang SAMA dgn jendela & dinding (d <= 0.55).
  const trimRt = ctx.trimPainter || null;
  let trimNight = false;
  let trimReady = false; // init = warna siang → load siang = 0 set
  function paintTrims(night) {
    if (!trimRt || typeof trimRt.paintTrimNight !== 'function') return;
    if (!trimReady) { trimReady = true; if (!night) return; }
    if (trimNight === night) return;
    trimNight = night;
    trimRt.paintTrimNight(night);
  }

  // ── Siklus 167: WHITEBOARD sprint ikut meredup malam ──
  // Papan putih #fbfbfa (MB unlit) menyala seperti panel lampu saat malam — kelas
  // bug 164-166. Tint warna MATERIAL (pola skyWins mode neon): redraw live papan
  // (60 dtk/visible) hanya map.needsUpdate → tint tak terhapus. Guard state +
  // ready terpisah, idempoten, ambang sama dgn jendela/dinding/trim (d <= 0.55).
  const boardRt = ctx.boardPainter || null;
  let boardNight = false;
  let boardReady = false; // init = tint siang (putih) → load siang = 0 set
  function paintBoard(night) {
    if (!boardRt || typeof boardRt.paintBoardNight !== 'function') return;
    if (!boardReady) { boardReady = true; if (!night) return; }
    if (boardNight === night) return;
    boardNight = night;
    boardRt.paintBoardNight(night);
  }

  // ── Siklus 168: JUDUL dinding "WFS PROJECT" ikut meredup malam ──
  // Teks putih+amber (avgLum 194, MB unlit) = kandidat terang tersisa audit 167.
  // REPAINT kanvas parametrik (pola 164/165) — kanvas statis, TANPA redraw live,
  // jadi repaint aman dan dua-tone brand terjaga (tint satu-warna akan meratakan
  // putih & amber jadi satu). Guard state+ready terpisah, idempoten, ambang sama.
  const titleRt = ctx.titlePainter || null;
  let titleNight = false;
  let titleReady = false; // init = palet siang → load siang = 0 repaint
  function paintTitle(night) {
    if (!titleRt || typeof titleRt.paintTitleNight !== 'function') return;
    if (!titleReady) { titleReady = true; if (!night) return; }
    if (titleNight === night) return;
    titleNight = night;
    titleRt.paintTitleNight(night);
  }

  // ── Siklus 169: PANEL PLAFON recessed & BOHLAM lampu gantung ikut meredup ──
  // Panel 0xF0F4FF (114 mesh MB, bidang unlit terluas di audit) & bohlam 0xfff3d6
  // (26 meja) — kelas bug 164-168. paintCeilNight dari createCeilingFixtures set
  // warna mesh ter-tag (__ceil). Guard state+ready terpisah, idempoten, ambang sama.
  const ceilRt = ctx.ceilPainter || null;
  let ceilNight = false;
  let ceilReady = false; // init = palet siang → load siang = 0 set
  function paintCeils(night) {
    if (!ceilRt || typeof ceilRt.paintCeilNight !== 'function') return;
    if (!ceilReady) { ceilReady = true; if (!night) return; }
    if (ceilNight === night) return;
    ceilNight = night;
    ceilRt.paintCeilNight(night);
  }

  // ── Siklus 170: resync painter day/night pasca mode neon OFF ──
  // toggleCyberpunk(false) menyetel sebagian warna keras (jendela, lampu) tapi
  // palet painter 164-169 (langit jendela, dinding, trim, papan, judul, plafon)
  // harus kembali sesuai jam NOW. Guard ready painter mengasumsikan "init = palet
  // siang" — setelah neon itu tak benar → reset state + paksa repaint semua.
  function resync() {
    const night = daylight(current) <= 0.55;
    // Set state ke KEBALIKAN target → paint() berikutnya pasti repaint sekali,
    // dan berakhir dgn state = target (getter tetap boolean, apply() lanjutan no-op).
    if (skyCanvas) { skyNight = !night; paintSkyNight(night); }
    if (wallRt) { wallReady = true; wallNight = !night; paintWalls(night); }
    if (trimRt) { trimReady = true; trimNight = !night; paintTrims(night); }
    if (boardRt) { boardReady = true; boardNight = !night; paintBoard(night); }
    if (titleRt) { titleReady = true; titleNight = !night; paintTitle(night); }
    if (ceilRt) { ceilReady = true; ceilNight = !night; paintCeils(night); }
  }

  function apply(min) {
    current = min;
    onTimeUpdate && onTimeUpdate(min);
    onStatusUpdate && onStatusUpdate(statusAt(min));
    const d = daylight(min);
    sun.intensity = 0.9 + d * 1.1;
    ambient.intensity = 0.32 + d * 0.24;
    scene.background = new THREE.Color(NAVY);
    scene.fog.color = new THREE.Color(NAVY);
    renderer.toneMappingExposure = 1.0 + d * 0.3;
    // Warna matahari: jingga sore (16:00–18:00) dan hangat pagi (05:00–07:00)
    let tint = 0xfff8f0;
    if (min > 960 && min < 1080) tint = mixHex(0xfff8f0, 0xffaa66, (min - 960) / 120);
    else if (min > 300 && min < 420) tint = mixHex(0xfff8f0, 0xffcc88, 1 - (min - 300) / 120);
    sun.color = new THREE.Color(tint);
    agentData.forEach((a) => { a.dGlow.intensity = 0.15 + (1 - d) * 0.3; });
    // Jendela: langit malam saat gelap (daylight ≤ 0.55), siang saat terang
    paintSkyNight(d <= 0.55);
    // Dinding: palet malam saat gelap (siklus 165) — sinkron dgn jendela
    paintWalls(d <= 0.55);
    // Trim & pilar: ikut malam saat gelap (siklus 166) — ambang sama
    paintTrims(d <= 0.55);
    // Whiteboard sprint: tint malam saat gelap (siklus 167) — ambang sama
    paintBoard(d <= 0.55);
    // Judul dinding WFS PROJECT: repaint malam saat gelap (siklus 168) — ambang sama
    paintTitle(d <= 0.55);
    // Panel plafon & bohlam gantung: redup malam saat gelap (siklus 169) — ambang sama
    paintCeils(d <= 0.55);
    onTick && onTick(min);
    // Siklus 120: __setTime (manual) harus meng-update jam simulasi juga — dulu
    // __setTime hanya apply lighting + updateMeeting, tapi __sim.time tidak
    // diset → jam HUD & auto-advance melompat balik dari waktu sisa simulasi
    // lama. Callback opsional (tanpa mode manual — slider React punya jalurnya).
    onTime && onTime(min);
  }
  return { apply, resync, get minutes() { return current; }, get skyNight() { return skyNight; }, get wallNight() { return wallNight; }, get trimNight() { return trimNight; }, get boardNight() { return boardNight; }, get titleNight() { return titleNight; }, get ceilNight() { return ceilNight; } };
}

// ── Mode neon: kumpulan "saklar" yang didaftarkan, bukan pemindaian seluruh scene ──
// Siklus 171: NEON = SATU-SATUNYA palet neon (single source of truth). Dulu toggle
// inline OfficeScene memakai angka sendiri (ambient 0.58/sun 1.25/tube 0.85) dan
// createNeonMode versi lama (0.14/0.06/0.55) jadi kode mati — dua palet berbeda
// untuk look yang sama = sumber drift. Nilai di bawah = look inline yang SUDAH
// diterima user (siklus 170, terverifikasi probe live) — enable/disable kini
// membaca dari sini, tak ada lagi pasangan angka kembar di OfficeScene.
export const NEON = {
  ambient: 0.58,
  sun: 1.25,
  exposure: 1.15,
  floor: 0x1a2638,
  carpet: 0x142033,
  ceilOpacity: 0.75,
  tubeLight: { intensity: 0.85, color: 0x00F0FF },
  tubeMesh: { color: 0x18E0FF, opacity: 0.95 },
  ceilPanel: 0x0A1526,
  skyWin: 0x14213F,
  dGlow: { intensity: 0.9, distance: 4.5 },
  screenLight: 0.6,
  reception: 0.9,
  pendBulb: 0x16243D,
  pendLight: { intensity: 0.06, color: 0x1E3A5F },
  panelLight: 0.03,
  // Restore (pasca-OFF): angka siang dasar daycycle — pencahayaan waktu & palet
  // painter 164-169 dipulihkan resync() (dipanggil toggleCyberpunk OfficeScene).
  restore: {
    ambient: 0.52,
    sun: 1.35,
    exposure: 1.15,
    floor: 0xffffff,
    carpet: 0xd0d8e0,
    ceilOpacity: 0.45,
    tubeLight: 0,
    tubeMesh: { color: 0x334466, opacity: 0.3 },
    dGlow: { intensity: 0.25, distance: 3.0 },
    screenLight: 0,
    reception: 0.4,
    pendBulb: 0xffffff,
    pendLight: { intensity: 0.15, color: 0xffe8cc },
    panelLight: 0.25,
  },
};

export function createNeonMode(ctx) {
  const { ambient, sun, renderer, floor, carpet, ceiling, tubes, tubeLights, agentData, screenLights, reception, pendants, panelLights, restoreTime } = ctx;
  const ceilPanels = ctx.ceilPanels || [];   // panel plafon recessed (MB putih) — ikut digelapkan
  const skyWins = ctx.skyWins || [];         // material jendela sky-view — ditint malam
  let on = false;
  const set = (list, fn) => list.forEach(fn);

  function enable() {
    ambient.intensity = NEON.ambient; sun.intensity = NEON.sun;
    renderer.toneMappingExposure = NEON.exposure;
    set(tubeLights, (l) => { l.intensity = NEON.tubeLight.intensity; l.color.set(NEON.tubeLight.color); });
    set(tubes, (m) => { m.material.color.set(NEON.tubeMesh.color); m.material.opacity = NEON.tubeMesh.opacity; });
    set(ceilPanels, (m) => { m.material.color.set(NEON.ceilPanel); });
    set(skyWins, (m) => { m.color.set(NEON.skyWin); });
    set(agentData, (a) => { a.dGlow.intensity = NEON.dGlow.intensity; a.dGlow.distance = NEON.dGlow.distance; });
    set(screenLights, (l) => { l.intensity = NEON.screenLight; });
    floor.material.color.set(NEON.floor); carpet.material.color.set(NEON.carpet); ceiling.material.opacity = NEON.ceilOpacity;
    set(panelLights, (l) => { l.intensity = NEON.panelLight; });
    set(pendants.bulbs, (m) => m.material.color.set(NEON.pendBulb));
    set(pendants.lights, (l) => { l.intensity = NEON.pendLight.intensity; l.color.set(NEON.pendLight.color); });
    reception.intensity = NEON.reception;
  }
  function disable() {
    const R = NEON.restore;
    restoreTime();
    floor.material.color.set(R.floor); carpet.material.color.set(R.carpet); ceiling.material.opacity = R.ceilOpacity;
    set(ceilPanels, (m) => { m.material.color.set(0xF0F4FF); });
    set(skyWins, (m) => { m.color.set(0xffffff); });
    set(tubeLights, (l) => { l.intensity = R.tubeLight; });
    set(tubes, (m) => { m.material.color.set(R.tubeMesh.color); m.material.opacity = R.tubeMesh.opacity; });
    set(screenLights, (l) => { l.intensity = R.screenLight; });
    reception.intensity = R.reception;
    set(panelLights, (l) => { l.intensity = R.panelLight; });
    set(pendants.bulbs, (m) => m.material.color.set(R.pendBulb));
    set(pendants.lights, (l) => { l.intensity = R.pendLight.intensity; l.color.set(R.pendLight.color); });
  }
  return { toggle() { on = !on; on ? enable() : disable(); return on; }, get on() { return on; } };
}

// ── Shift: datang 08:00–08:30, pulang 18:00–18:30, malam hanya agent utama ──
export function createShift(ctx) {
  const { THREE, agentData, rng, isNamesVisible } = ctx;
  const namesOn = () => (typeof isNamesVisible === 'function' ? isNamesVisible() : true);
  const { SHIFT, lunchSpot, campusLunchSpot, lunchPause, shiftStep } = shiftSpec;
  const ARRIVE = SHIFT.ARRIVE;
  const DEPART = SHIFT.DEPART;
  const DOOR = SHIFT.DOOR;
  let phase = 'working';
  let inLunch = false;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function arrive() {
    const handled = new Set();
    const doorY = floorElevationAt(DOOR.z);
    ARRIVE.forEach((idx, i) => {
      handled.add(idx);
      const ad = agentData[idx];
      if (!ad || ad.state !== 'offsite') return;
      later(i * 800, () => {
        ad.walker.visible = true;
        ad.walker.position.set(DOOR.x, doorY, DOOR.z);
        ad.sittingChar.visible = false;
        if (ad.label) ad.label.visible = namesOn();
        // Pulang ke mejanya masing-masing — WAJIB set walkTarget: tanpa ini
        // walking_back memakai target lama (pintu keluar/kafe) → agent tidak
        // pernah jalan dari pintu, langsung duduk / lari ke tempat salah.
        ad.walkTarget = { x: ad.home.x, z: ad.home.z };
        ad._route = null; // recalc otomatis: stepRoute jatuh ke walkTarget
        ad.resetStride = true; // reset pose stride dari sesi jalan sebelumnya
        ad.state = 'walking_back';
      });
    });
    // Agen ekstra di luar daftar historis (mis. AGENTS_EXTRA)
    let extraIndex = ARRIVE.length;
    agentData.forEach((ad, idx) => {
      if (handled.has(idx) || !ad || ad.state !== 'offsite') return;
      later((extraIndex++) * 600, () => {
        ad.walker.visible = true;
        ad.walker.position.set(DOOR.x, doorY, DOOR.z);
        ad.sittingChar.visible = false;
        if (ad.label) ad.label.visible = namesOn();
        ad.walkTarget = { x: ad.home.x, z: ad.home.z };
        ad._route = null;
        ad.resetStride = true;
        ad.state = 'walking_back';
      });
    });
  }
  function depart() {
    if (ctx.alwaysActive) return; // Mode 24/7 AI Office: seluruh agen selalu aktif di kantor
    const handled = new Set();
    DEPART.forEach((idx, i) => {
      handled.add(idx);
      const ad = agentData[idx];
      if (!ad) return;
      later(i * 800, () => {
        if (ad.state !== 'sitting') return;
        ad.sittingChar.visible = false;
        ad.walker.visible = true;
        ad.walker.position.set(ad.home.x, ad.home.y || 0, ad.home.z);
        // Pintu keluar: target titik DI DALAM kantor dekat celah pintu (x=-12, z=8),
        // lalu rute koridor via stepRoute — dulu langsung DOOR dengan tanpa rute
        // (leaving pakai stepRoute → garis lurus menembus baris meja).
        ad.walkTarget = { x: -12, z: 8 };
        ad._route = null; // recalc otomatis via stepRoute fallback
        ad.state = 'leaving';
      });
    });
    let extraIndex = DEPART.length;
    agentData.forEach((ad, idx) => {
      if (handled.has(idx) || !ad) return;
      later((extraIndex++) * 600, () => {
        if (ad.state !== 'sitting') return;
        ad.sittingChar.visible = false;
        ad.walker.visible = true;
        ad.walker.position.set(ad.home.x, ad.home.y || 0, ad.home.z);
        ad.walkTarget = { x: -12, z: 8 };
        ad._route = null;
        ad.state = 'leaving';
      });
    });
  }
  function nightfall() {
    if (ctx.alwaysActive) return; // Mode 24/7 AI Office: seluruh agen selalu aktif di kantor
    agentData.forEach((ad, i) => {
      if (i === 0) return;
      ad.sittingChar.visible = false; ad.walker.visible = false; ad.state = 'offsite';
      if (ad.label) ad.label.visible = false;
    });
  }
  function dawn() {
    agentData.forEach((ad) => {
      ad.sittingChar.visible = true; ad.walker.visible = false; ad.state = 'sitting';
      if (ad.label) ad.label.visible = namesOn();
      ad.timer = 4 + rng.r(0, 8);
    });
  }

  function restoreWorkingDesks() {
    agentData.forEach((ad) => {
      if (ad.state === 'offsite') {
        ad.sittingChar.visible = true; ad.walker.visible = false; ad.state = 'sitting';
        if (ad.label) ad.label.visible = namesOn();
        ad.timer = 4 + rng.r(0, 8);
      }
    });
  }

  // ── Lunch break 12:00–13:00: agent ramai-ramai ke CAFÉ, lalu kembali ──
  // Dipicu dari OfficeScene: saat menit masuk window lunch, setLunch(true);\n  // saat keluar window, setLunch(false) → semua yang sedang lunch pulang ke meja.
  function sendToLunch() {
    phase = 'lunch';
    agentData.forEach((ad) => {
      if (ad.state !== 'sitting') return;
      ad.sittingChar.visible = false; ad.walker.visible = true;
      ad.walker.position.set(ad.home.x, ad.home.y || 0, ad.home.z);
      ad.lunch = true;
      ad.state = 'walking_out';
      const spot = (ctx.isCampus && typeof campusLunchSpot === 'function')
        ? campusLunchSpot(rng)
        : lunchSpot(rng);
      ad.walkTarget = spot; // L3 Executive Cafe Promenade pada kampus multi-lantai (bebas rintangan)
      ad._route = null;
      ad.walkPause = lunchPause(rng); // rencana ngopi lama
    });
  }
  function endLunch() {
    phase = 'working';
    agentData.forEach((ad) => {
      ad.lunch = false;
      if (ad.state === 'sitting') return;
      // yang sedang di luar (walker visible, bukan rapat) dipulangkan ke mejanya
      if (ad.state === 'meeting') return;
      ad.state = 'walking_back';
      ad.collab = null; ad.partner = null;
      ad.walkTarget = { x: ad.home.x, z: ad.home.z };
      ad._route = null;
    });
  }

  return {
    update(m) {
      // Mesin fase murni (shiftStep) memutuskan transisi & event; createShift
      // hanya mengeksekusi efeknya terhadap scene.
      const r = shiftStep({ phase, lunch: inLunch }, m);
      phase = r.phase; inLunch = r.lunch;
      for (const ev of r.events) {
        if (ev === 'lunch_start') sendToLunch();
        else if (ev === 'lunch_end') endLunch();
        else if (ev === 'arrive') arrive();
        else if (ev === 'depart') depart();
        else if (ev === 'nightfall') nightfall();
        else if (ev === 'dawn') dawn();
        else if (ev === 'working_am' || ev === 'working_pm') restoreWorkingDesks();
      }
    },
    dispose() { timers.forEach(clearTimeout); timers.clear(); },
    get phase() { return phase; },
    get lunch() { return inLunch; },
  };
}
