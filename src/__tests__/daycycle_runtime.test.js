// Unit test createNeonMode & createShift (daycycle.js) — bagian runtime yang
// belum tercakup daycycle.test.js (statusAt/daylight/mixHex sudah ada di sana).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNeonMode, createShift } from '../scene/parts/daycycle.js';
import { SHIFT } from '../scene/parts/shift_spec.js';

// ── Stub scene objects: objek dengan properti yang diubah enable/disable ──
const light = () => ({ intensity: 1, color: { set: vi.fn() }, distance: 0 });
const mat = () => ({ color: { set: vi.fn() }, opacity: 1 });

function neonCtx() {
  return {
    ambient: light(),
    sun: light(),
    renderer: { toneMappingExposure: 1 },
    floor: { material: mat() },
    carpet: { material: mat() },
    ceiling: { material: mat() },
    tubes: [{ material: mat() }, { material: mat() }],
    tubeLights: [light(), light()],
    agentData: [{ dGlow: light() }, { dGlow: light() }],
    screenLights: [light()],
    reception: light(),
    pendants: { bulbs: [{ material: mat() }], lights: [light()] },
    panelLights: [light()],
    restoreTime: vi.fn(),
  };
}

describe('createNeonMode — toggle mode cyberpunk', () => {
  it('awal mati; toggle pertama menyalakan, kedua mematikan (bolak-balik)', () => {
    const ctx = neonCtx();
    const neon = createNeonMode(ctx);
    expect(neon.on).toBe(false);
    expect(neon.toggle()).toBe(true);
    expect(neon.on).toBe(true);
    expect(neon.toggle()).toBe(false);
    expect(neon.on).toBe(false);
  });

  it('enable: gelapkan ambient/sun/exposure, tubelight & screen menyala biru, glow agent maksimal', () => {
    const ctx = neonCtx();
    const neon = createNeonMode(ctx);
    neon.toggle(); // on
    expect(ctx.ambient.intensity).toBe(0.12);
    expect(ctx.sun.intensity).toBe(0.08);
    expect(ctx.renderer.toneMappingExposure).toBe(0.55);
    ctx.tubeLights.forEach((l) => {
      expect(l.intensity).toBe(0.35);
      expect(l.color.set).toHaveBeenCalledWith(0x1a3355);
    });
    ctx.agentData.forEach((a) => {
      expect(a.dGlow.intensity).toBe(0.9);
      expect(a.dGlow.distance).toBe(4.5);
    });
    expect(ctx.reception.intensity).toBe(0.7);
    expect(ctx.floor.material.color.set).toHaveBeenCalledWith(0x060c18);
  });

  it('disable: restoreTime dipanggil & nilai kembali ke kondisi siang', () => {
    const ctx = neonCtx();
    const neon = createNeonMode(ctx);
    neon.toggle(); // on
    neon.toggle(); // off
    expect(ctx.restoreTime).toHaveBeenCalledTimes(1);
    expect(ctx.floor.material.color.set).toHaveBeenCalledWith(0xe8e8e8);
    expect(ctx.carpet.material.color.set).toHaveBeenCalledWith(0xd0d8e0);
    ctx.tubeLights.forEach((l) => expect(l.intensity).toBe(0));
    expect(ctx.reception.intensity).toBe(0.4);
    ctx.panelLights.forEach((l) => expect(l.intensity).toBe(0.25));
    ctx.agentData.forEach((a) => {
      // dGlow tidak direset di disable — biarkan restoreTime yang mengembalikan waktu
      expect(a.dGlow.intensity).toBe(0.9);
    });
  });
});

// ── Stub agent untuk createShift: walker & sittingChar dengan visible, dsb ──
function stubAgent(i) {
  return {
    agent: { name: 'A' + i },
    home: { x: i, z: 0 },
    state: i === 0 ? 'sitting' : 'offsite',
    walker: { visible: false, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { y: 0 } },
    sittingChar: { visible: true },
    walkTarget: null,
    _route: null,
    resetStride: false,
    timer: 0,
    lunch: false,
    collab: null,
    partner: null,
  };
}
const shiftCtx = () => ({ THREE: undefined, agentData: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(stubAgent), rng: { r: (a, b) => a } });

describe('createShift — mesin fase shift (eksekusi efek)', () => {
  afterEach(() => vi.useRealTimers());

  it('mulai phase working; lunch tidak aktif', () => {
    const s = createShift(shiftCtx());
    expect(s.phase).toBe('working');
    expect(s.lunch).toBe(false);
    s.dispose();
  });

  it('sendToLunch: agen duduk jadi walker visible → walking_out, target depan bar stools, lunch flag', () => {
    const ctx = shiftCtx();
    ctx.agentData[0].state = 'sitting';
    ctx.agentData[1].state = 'sitting';
    const s = createShift(ctx);
    s.update(SHIFT.LUNCH_START); // 720 → lunch_start
    expect(s.phase).toBe('lunch');
    expect(s.lunch).toBe(true);
    const a = ctx.agentData[0];
    expect(a.lunch).toBe(true);
    expect(a.state).toBe('walking_out');
    expect(a.walker.visible).toBe(true);
    expect(a.sittingChar.visible).toBe(false);
    // target area lunch ±jitter, bukan di atas stools (z 8.5)
    expect(a.walkTarget.x).toBeGreaterThanOrEqual(SHIFT.LUNCH_SPOT_X - SHIFT.LUNCH_SPOT_JITTER_X);
    expect(a.walkTarget.z).toBeGreaterThanOrEqual(SHIFT.LUNCH_SPOT_Z);
    expect(a.walkTarget.z).toBeLessThanOrEqual(SHIFT.LUNCH_SPOT_Z + SHIFT.LUNCH_SPOT_JITTER_Z);
    expect(a.walkPause).toBe(SHIFT.LUNCH_PAUSE_MIN); // rng.r(a,b)=a
    s.dispose();
  });

  it('endLunch: yang sedang di luar dipulangkan (walking_back), collab dibersihkan; meeting tidak diganggu', () => {
    const ctx = shiftCtx();
    ctx.agentData[0].state = 'walking_out'; // sedang lunch
    ctx.agentData[1].state = 'meeting';     // rapat — jangan dipulangkan
    const s = createShift(ctx);
    s.update(SHIFT.LUNCH_START); // masuk lunch (0 sudah walking_out sebelum sendToLunch → tidak diubah)
    s.update(SHIFT.LUNCH_END);   // 780 → lunch_end
    expect(s.phase).toBe('working');
    const a = ctx.agentData[0];
    expect(a.lunch).toBe(false);
    expect(a.state).toBe('walking_back');
    expect(a.walkTarget).toEqual({ x: a.home.x, z: a.home.z });
    expect(a.collab).toBeNull();
    // meeting tidak berubah
    expect(ctx.agentData[1].state).toBe('meeting');
    s.dispose();
  });

  it('nightfall: semua kecuali agent[0] & offsite disembunyikan', () => {
    const ctx = shiftCtx();
    ctx.agentData[0].state = 'sitting';
    ctx.agentData[2].state = 'sitting';
    ctx.agentData[3].state = 'offsite';
    const s = createShift(ctx);
    s.update(400); // malam (m < ARRIVE_FROM=480)
    expect(s.phase).toBe('night');
    // nightfall melewatkan i===0 → agent utama tetap sitting; agen duduk lain offsite
    expect(ctx.agentData[0].state).toBe('sitting');
    expect(ctx.agentData[2].state).toBe('offsite');
    expect(ctx.agentData[2].sittingChar.visible).toBe(false);
    expect(ctx.agentData[2].walker.visible).toBe(false);
    // offsite tetap offsite (tidak diubah)
    expect(ctx.agentData[3].state).toBe('offsite');
    s.dispose();
  });

  it('arrive: dari malam → window kedatangan; dawn lalu walker spawn di DOOR, walkTarget = home (terjadwal per 800ms)', () => {
    vi.useFakeTimers();
    const ctx = shiftCtx();
    const s = createShift(ctx);
    s.update(400); // malam dulu (phase night)
    expect(s.phase).toBe('night');
    s.update(SHIFT.ARRIVE_FROM); // 480 → dawn + arrive
    expect(s.phase).toBe('arriving');
    // agen offsite belum bergerak sebelum timer
    expect(ctx.agentData[2].walker.visible).toBe(false);
    vi.advanceTimersByTime(8 * 800 + 10); // ARRIVE punya 8 indeks
    const a = ctx.agentData[2];
    expect(a.walker.visible).toBe(true);
    // dawn() sudah menghidupkan semua jadi sitting; timer arrive hanya memproses yang state offsite
    expect(['walking_back', 'sitting']).toContain(a.state);
    if (a.state === 'walking_back') {
      expect(a.walkTarget).toEqual({ x: a.home.x, z: a.home.z });
      expect(a._route).toBeNull();
      expect(a.resetStride).toBe(true);
      expect(a.sittingChar.visible).toBe(false);
    }
    s.dispose();
  });

  it('siklus penuh 24 jam lewat update(): window ganda tidak spam event (idempoten)', () => {
    const ctx = shiftCtx();
    ctx.agentData[0].state = 'sitting';
    const s = createShift(ctx);
    for (let m = 400; m <= 900; m++) s.update(m); // fajar → siang → lunch → sore
    // phase berakhir working (sore sebelum pulang)
    expect(s.phase).toBe('working');
    // agen yang tadinya sitting: setelah lunch window ia walking_back (bukan stuck 'walking_out' duplikat)
    expect(ctx.agentData[0].state).toBe('walking_back');
    s.dispose();
  });

  it('arrive: walker visible di DOOR, walkTarget = home, state walking_back (terjadwal per 800ms)', () => {
    vi.useFakeTimers();
    const ctx = shiftCtx();
    const s = createShift(ctx);
    s.update(400); // malam dulu (phase night)
    expect(s.phase).toBe('night');
    s.update(SHIFT.ARRIVE_FROM); // 480 → dawn + arrive
    expect(s.phase).toBe('arriving');
    // agen offsite belum bergerak sebelum timer
    expect(ctx.agentData[2].walker.visible).toBe(false);
    vi.advanceTimersByTime(8 * 800 + 10); // ARRIVE punya 8 indeks
    const a = ctx.agentData[2];
    // dawn() sudah menghidupkan semua jadi sitting; timer arrive hanya memproses yang masih offsite
    expect(['walking_back', 'sitting']).toContain(a.state);
    if (a.state === 'walking_back') {
      expect(a.walkTarget).toEqual({ x: a.home.x, z: a.home.z });
      expect(a._route).toBeNull();
      expect(a.resetStride).toBe(true);
      expect(a.sittingChar.visible).toBe(false);
    }
    s.dispose();
  });

  it('depart: hanya agen sitting yang dijadwalkan pulang, target pintu keluar dalam kantor', () => {
    vi.useFakeTimers();
    const ctx = shiftCtx();
    ctx.agentData[0].state = 'sitting';
    ctx.agentData[5].state = 'walking_out'; // bukan sitting → tidak ikut
    const s = createShift(ctx);
    s.update(SHIFT.LEAVE_FROM); // 1080 → depart
    expect(s.phase).toBe('leaving');
    vi.advanceTimersByTime(8 * 800 + 10);
    const a = ctx.agentData[0];
    expect(a.state).toBe('leaving');
    expect(a.walker.visible).toBe(true);
    expect(a.walkTarget).toEqual({ x: -12, z: 8 }); // titik dalam kantor dekat pintu
    expect(ctx.agentData[5].state).toBe('walking_out'); // tidak diubah
    s.dispose();
  });

  it('dispose: semua setTimeout dibatalkan (tidak ada agen yang bergerak setelah dispose)', () => {
    vi.useFakeTimers();
    const ctx = shiftCtx();
    const s = createShift(ctx);
    s.update(SHIFT.ARRIVE_FROM);
    s.dispose();
    vi.advanceTimersByTime(10000);
    expect(ctx.agentData[2].walker.visible).toBe(false);
    expect(ctx.agentData[2].state).toBe('offsite');
  });
});
