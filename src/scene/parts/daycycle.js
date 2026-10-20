// Waktu, pencahayaan, mode neon, dan pergantian shift WFS Project.

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
  const ch = (v, s) => (v >> s) & 255;
  const mix = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function createLighting(ctx) {
  const { THREE, scene, renderer, sun, ambient, agentData, onTimeUpdate, onStatusUpdate, onTick } = ctx;
  const NAVY = 0x000c1e;
  let current = 660;

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
    onTick && onTick(min);
  }
  return { apply, get minutes() { return current; } };
}

// ── Mode neon: kumpulan "saklar" yang didaftarkan, bukan pemindaian seluruh scene ──
export function createNeonMode(ctx) {
  const { ambient, sun, renderer, floor, carpet, ceiling, tubes, tubeLights, agentData, screenLights, reception, pendants, panelLights, restoreTime } = ctx;
  let on = false;
  const set = (list, fn) => list.forEach(fn);

  function enable() {
    ambient.intensity = 0.12; sun.intensity = 0.08; renderer.toneMappingExposure = 0.55;
    set(tubeLights, (l) => { l.intensity = 0.35; l.color.set(0x1a3355); });
    set(tubes, (m) => { m.material.color.set(0x2244aa); m.material.opacity = 0.7; });
    set(agentData, (a) => { a.dGlow.intensity = 0.9; a.dGlow.distance = 4.5; });
    set(screenLights, (l) => { l.intensity = 0.5; });
    floor.material.color.set(0x060c18); carpet.material.color.set(0x080e1a); ceiling.material.opacity = 0.65;
    set(panelLights, (l) => { l.intensity = 0.03; });
    set(pendants.bulbs, (m) => m.material.color.set(0x222233));
    set(pendants.lights, (l) => { l.intensity = 0.08; l.color.set(0x334455); });
    reception.intensity = 0.7;
  }
  function disable() {
    restoreTime();
    floor.material.color.set(0xe8e8e8); carpet.material.color.set(0xd0d8e0); ceiling.material.opacity = 0.45;
    set(tubeLights, (l) => { l.intensity = 0; });
    set(tubes, (m) => { m.material.color.set(0x334466); m.material.opacity = 0.3; });
    set(screenLights, (l) => { l.intensity = 0; });
    reception.intensity = 0.4;
    set(panelLights, (l) => { l.intensity = 0.25; });
    set(pendants.bulbs, (m) => m.material.color.set(0xfff8e0));
    set(pendants.lights, (l) => { l.intensity = 0.15; l.color.set(0xffe8cc); });
  }
  return { toggle() { on = !on; on ? enable() : disable(); return on; }, get on() { return on; } };
}

// ── Shift: datang 08:00–08:30, pulang 18:00–18:30, malam hanya agent utama ──
export function createShift(ctx) {
  const { THREE, agentData, rng } = ctx;
  const ARRIVE = [0, 2, 4, 1, 5, 3, 6, 7];
  const DEPART = [7, 6, 3, 5, 1, 4, 2, 0];
  const DOOR = { x: -12, z: 8 };
  let phase = 'working';
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  function arrive() {
    ARRIVE.forEach((idx, i) => {
      const ad = agentData[idx];
      if (!ad || ad.state !== 'offsite') return;
      later(i * 800, () => {
        ad.walker.visible = true;
        ad.walker.position.set(DOOR.x, 0, DOOR.z);
        ad.sittingChar.visible = false;
        ad.state = 'walking_back';
      });
    });
  }
  function depart() {
    DEPART.forEach((idx, i) => {
      const ad = agentData[idx];
      if (!ad) return;
      later(i * 800, () => {
        if (ad.state !== 'sitting') return;
        ad.sittingChar.visible = false;
        ad.walker.visible = true;
        ad.walker.position.set(ad.home.x, 0, ad.home.z);
        ad.walkTarget = { ...DOOR };
        ad.state = 'leaving';
      });
    });
  }
  function nightfall() {
    agentData.forEach((ad, i) => {
      if (i === 0 || ad.state === 'offsite') return;
      ad.sittingChar.visible = false; ad.walker.visible = false; ad.state = 'offsite';
    });
  }
  function dawn() {
    agentData.forEach((ad) => {
      ad.sittingChar.visible = true; ad.walker.visible = false; ad.state = 'sitting';
      ad.timer = 4 + rng.r(0, 8);
    });
  }

  // ── Lunch break 12:00–13:00: agent ramai-ramai ke CAFÉ, lalu kembali ──
  // Dipicu dari OfficeScene: saat menit masuk window lunch, setLunch(true);
  // saat keluar window, setLunch(false) → semua yang sedang lunch pulang ke meja.
  function sendToLunch() {
    phase = 'lunch';
    agentData.forEach((ad) => {
      if (ad.state !== 'sitting') return;
      ad.sittingChar.visible = false; ad.walker.visible = true;
      ad.walker.position.set(ad.home.x, 0, ad.home.z);
      ad.lunch = true;
      ad.state = 'walking_out';
      ad.walkTarget = { x: -9.5 + rng.r(-1.2, 1.2), z: 9.0 + rng.r(0, 0.35) }; // depan bar stools (bukan di atasnya — stools di z 8.5)
      ad._route = null;
      ad.walkPause = rng.r(6, 14); // rencana ngopi lama
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
  let inLunch = false;
  function updateLunch(m) {
    if (m >= 720 && m < 780 && !inLunch) { inLunch = true; sendToLunch(); }
    else if ((m < 720 || m >= 780) && inLunch) { inLunch = false; endLunch(); }
  }

  return {
    update(m) {
      updateLunch(m);
      if (m >= 480 && m <= 510 && phase !== 'arriving' && phase !== 'working') { phase = 'arriving'; arrive(); }
      if (m > 510 && m < 720) phase = 'working';
      if (m >= 780 && m < 1080) phase = 'working';
      if (m >= 1080 && m <= 1110 && phase !== 'leaving') { phase = 'leaving'; depart(); }
      if (m > 1110 || m < 480) { nightfall(); phase = 'night'; }
      if (m >= 480 && phase === 'night') { phase = 'arriving'; dawn(); }
    },
    dispose() { timers.forEach(clearTimeout); timers.clear(); },
    get phase() { return phase; },
    get lunch() { return inLunch; },
  };
}
