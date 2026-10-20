// Unit test runtime createMotion (motion.js) — state machine gerak karakter:
// sitting→walking_out (chooseTrip), trip biasa vs collab (converse+bubble),
// walking_back→sitting (resetStride), leaving→offsite, follow label, lunch.
// Stub scene ala daycycle_runtime.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMotion } from '../scene/parts/motion.js';
import { COLLAB_OFFSET, TRIP_PAUSE_MIN, SIT_TIMER_MIN } from '../scene/parts/trip_plan.js';
import { FRONT } from '../scene/parts/routing.js';

// motion.js mencatat window.__collabCount — shim utk lingkungan node
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

// ── stub helpers ──
function mkWalker() {
  const limb = (ud) => ({ userData: ud, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 } });
  const children = [
    limb({ isLeg: true, phase: 0 }),
    limb({ isLeg: true, phase: Math.PI }),
    limb({ isArm: true, phase: 0 }),
  ];
  return {
    children,
    visible: false,
    position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    rotation: { y: 0 },
  };
}

function mkAd(i, home = { x: 0, z: 0 }) {
  return {
    agent: { name: 'A' + i, hex: '#fff', role: 'Backend Engineer' },
    home,
    state: 'sitting',
    timer: 10,
    walker: mkWalker(),
    sittingChar: { visible: true, rotation: { y: 0 } },
    label: { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
    walkPause: 0,
    lunch: false,
  };
}

// ctx stub: rng deterministik (r → a, i → 0), walkDestinations 1 titik jauh,
// pickCollab dikendalikan per-test via variabel.
let collabResult = null;
let bubbles = [];
function mkCtx(agentData, dests) {
  return {
    rng: { r: (a) => a, n: () => 0.1, i: () => 0 },
    agentData,
    walkDestinations: dests || [{ x: 6, z: -0.6 }],
    pickCollab: () => collabResult,
    createBubble: (x, y, z, text, hex, anchor) => { bubbles.push({ x, y, z, text, hex, anchor }); },
  };
}

beforeEach(() => { bubbles = []; collabResult = null; delete globalThis.__collabCount; delete globalThis.__collabLast; });
afterEach(() => { vi.restoreAllMocks(); });

describe('createMotion — sitting', () => {
  it('timer belum habis → tidak ada perubahan state', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    const update = createMotion(mkCtx([ad]));
    update(0.5);
    expect(ad.state).toBe('sitting');
    expect(ad.sittingChar.visible).toBe(true);
  });

  it('timer habis → walking_out: duduk disembunyikan, walker muncul di home, walkPause direset', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.timer = 0.2;
    const update = createMotion(mkCtx([ad]));
    update(0.3);
    expect(ad.state).toBe('walking_out');
    expect(ad.sittingChar.visible).toBe(false);
    expect(ad.walker.visible).toBe(true);
    expect(ad.walker.position.x).toBe(-4);
    expect(ad.walker.position.z).toBe(1.5);
    expect(ad.walkPause).toBe(0);
    // tujuan dipilih dari walkDestinations[0] + jitter(rng stub r=a → tepat dest)
    expect(ad.walkTarget).toEqual({ x: 6 - 0.5, z: -0.6 - 0.5 }); // jitter rng.r(a,b)=a → -0.5
    // rute koridor dihitung segera (dest band 1, home z=1.5 juga band 1, dx besar → via FRONT)
    expect(Array.isArray(ad._route)).toBe(true);
  });
});

describe('createMotion — walking_out trip biasa', () => {
  it('bergerak menuju walkTarget (mendekat), label mengikuti walker', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.state = 'walking_out';
    ad.timer = 0;
    ad.sittingChar.visible = false;
    ad.walker.visible = true;
    ad.walkTarget = { x: 6, z: 1.5 }; // satu band, dx besar → route via koridor depan
    ad.walker.position.set(5.0, 0, 1.5);
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    const p0 = { x: ad.walker.position.x, z: ad.walker.position.z };
    update(0.25);
    const moved = Math.hypot(ad.walker.position.x - p0.x, ad.walker.position.z - p0.z);
    expect(moved).toBeGreaterThan(0);
    expect(ad.label.position.x).toBeCloseTo(ad.walker.position.x, 5);
    expect(ad.label.position.z).toBeCloseTo(ad.walker.position.z, 5);
    expect(ad.label.position.x).toBeCloseTo(ad.walker.position.x, 5);
    expect(ad.label.position.z).toBeCloseTo(ad.walker.position.z, 5);
  });

  it('sampai tujuan → walkPause bertambah; lewat TRIP_PAUSE_MIN (+jitter rng=0) → walking_back', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.state = 'walking_out';
    ad.sittingChar.visible = false;
    ad.walker.visible = true;
    ad.walkTarget = { x: -3.6, z: 1.5 };
    ad.walker.position.set(-3.6, 0, 1.5); // sudah di target (d < ARRIVE)
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    update(0.1);
    expect(ad.walkPause).toBeGreaterThan(0);
    expect(ad.state).toBe('walking_out'); // belum lewat pause
    update(TRIP_PAUSE_MIN + 0.5);         // satu update panjang → pause terlampaui
    expect(ad.state).toBe('walking_back');
  });

  it('lunch: tidak beralih ke walking_back — tetap walking_out walau lama', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.state = 'walking_out';
    ad.lunch = true;
    ad.sittingChar.visible = false;
    ad.walker.visible = true;
    ad.walkTarget = { x: -3.6, z: 1.5 };
    ad.walker.position.set(-3.6, 0, 1.5);
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    update(0.1);
    update(30);
    expect(ad.state).toBe('walking_out');
    expect(ad.walkPause).toBeGreaterThan(0);
  });
});

describe('createMotion — collab & converse', () => {
  function collabSetup() {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    const partner = mkAd(1, { x: -4, z: 6 });
    partner.state = 'sitting';
    ad.state = 'walking_out';
    ad.sittingChar.visible = false;
    ad.walker.visible = true;
    ad.walkTarget = { x: -4 + COLLAB_OFFSET.x, z: 6 + COLLAB_OFFSET.z };
    ad.walker.position.set(ad.walkTarget.x, 0, ad.walkTarget.z); // sudah sampai
    ad._route = null;
    ad.collab = { partner, lines: ['halo', 'hai'] };
    ad.partner = partner;
    ad._talk = -1;
    collabResult = ad.collab;
    return { ad, partner };
  }

  it('chooseTrip collab: collab/partner/label tercatat + window.__collabCount bertambah', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    const partner = mkAd(1, { x: -4, z: 6 });
    partner.state = 'sitting';
    ad.timer = 0;
    collabResult = { partner, lines: ['a', 'b'], first: true };
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < COLLAB_CHANCE 0.75
    const update = createMotion(mkCtx([ad, partner]));
    update(0.3);
    expect(ad.state).toBe('walking_out');
    expect(ad.collab).toBe(collabResult);
    expect(ad.partner).toBe(partner);
    expect(ad._talk).toBe(-1);
    expect(ad.walkTarget.x).toBeCloseTo(-4 + COLLAB_OFFSET.x, 5);
    expect(ad.walkTarget.z).toBeCloseTo(6 + COLLAB_OFFSET.z, 5);
    expect(globalThis.__collabCount).toBe(1);
    expect(globalThis.__collabLast).toBe('A0->A1');
  });

  it('converse: baris pertama dibuatkan bubble untuk pengunjung (genap), rotasi saling menghadap', () => {
    const { ad, partner } = collabSetup();
    const update = createMotion(mkCtx([ad, partner]));
    update(0.1); // sampai target, walkPause=0.1 → step 0 → bubble pengunjung
    expect(ad.state).toBe('walking_out');
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].text).toBe('halo');
    expect(ad.walker.rotation.y).not.toBe(0); // menghadap partner
    expect(partner.sittingChar.rotation.y).not.toBe(0);
  });

  it('baris kedua (ganjil) → bubble di anchor partner', () => {
    const { ad, partner } = collabSetup();
    const update = createMotion(mkCtx([ad, partner]));
    update(0.1);              // baris 0
    update(1.8);              // walkPause≈1.9 → step 1 → baris partner
    expect(bubbles).toHaveLength(2);
    expect(bubbles[1].text).toBe('hai');
  });

  it('percakapan selesai (walkPause > LINE_SEC*2 + 1.2) → walking_back + partner menghadap depan lagi', () => {
    const { ad, partner } = collabSetup();
    const update = createMotion(mkCtx([ad, partner]));
    update(0.1);
    update(6);
    expect(ad.state).toBe('walking_back');
    expect(ad.collab).toBeNull();
    expect(ad.partner).toBeNull();
    expect(partner.sittingChar.rotation.y).toBe(0);
  });
});

describe('createMotion — walking_back', () => {
  it('sampai home → sitting: walker disembunyikan, duduk tampil, timer SIT_TIMER_MIN(+jitter rng=0), pose direset', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.state = 'walking_back';
    ad.walkTarget = { x: -4, z: 1.5 };
    ad._route = null;
    ad.walker.visible = true;
    ad.walker.position.set(-4.4, 0.02, 1.5);
    ad.walker.children[0].position.z = 0.05; // pose stride tertinggal
    ad.walker.children[0].rotation.x = 0.2;
    ad.walker.children[2].rotation.x = 0.4;
    ad.walker.position.y = 0.03;
    const update = createMotion(mkCtx([ad]));
    update(0.2); update(0.2); // langkah 0.32 → sisa 0.08 < ARRIVE → duduk
    expect(ad.state).toBe('sitting');
    expect(ad.walker.visible).toBe(false);
    expect(ad.sittingChar.visible).toBe(true);
    expect(ad.timer).toBe(SIT_TIMER_MIN);
    expect(ad.walker.children[0].position.z).toBe(0);
    expect(ad.walker.children[0].rotation.x).toBe(0);
    expect(ad.walker.children[2].rotation.x).toBe(0);
    expect(ad.walker.position.y).toBe(0);
    expect(ad.label.position.x).toBe(-4); // label balik ke meja
  });

  it('flag resetStride (spawn shift) → pose direset sebelum bergerak', () => {
    const ad = mkAd(0, { x: -4, z: 1.5 });
    ad.state = 'walking_back';
    ad.resetStride = true;
    ad.walkTarget = { x: -4, z: 1.5 };
    ad._route = null;
    ad.walker.visible = true;
    ad.walker.position.set(-12, 0.03, 8); // baru spawn di pintu
    ad.walker.children[0].position.z = 0.07;
    ad.walker.children[2].rotation.x = 0.5;
    const update = createMotion(mkCtx([ad]));
    update(0.05);
    expect(ad.resetStride).toBe(false);        // flag dikonsumsi sekali
    expect(ad.label.position.z).toBeLessThan(8); // bergerak keluar pintu (menuju rute gang)
  });
});

describe('createMotion — leaving / offsite', () => {
  it('dekat pintu keluar → walker hilang, state offsite, label balik ke home', () => {
    const ad = mkAd(0, { x: -8, z: -3 });
    ad.state = 'leaving';
    ad.walker.visible = true;
    ad.walkTarget = { x: -12, z: 8 };
    ad.walker.position.set(-11.9, 0, 7.7); // dekat target
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    update(0.1);
    expect(ad.state).toBe('offsite');
    expect(ad.walker.visible).toBe(false);
    expect(ad.label.position.x).toBe(-8);
    expect(ad.label.position.z).toBe(-3);
  });

  it('masih jauh → tetap leaving, bergerak menuju pintu', () => {
    const ad = mkAd(0, { x: -8, z: -3 });
    ad.state = 'leaving';
    ad.walker.visible = true;
    ad.walkTarget = { x: -12, z: 8 };
    ad.walker.position.set(-8, 0, -3);
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    update(0.2);
    expect(ad.state).toBe('leaving');
    const moved = Math.hypot(ad.walker.position.x - (-8), ad.walker.position.z - (-3));
    expect(moved).toBeGreaterThan(0); // keluar dari titik awal (rute via gang)
  });
});

describe('createMotion — hard clamp & route koridor', () => {
  it('stepMove clamp batas dunia: walker tidak keluar lantai (BOUNDS ±12.4/±9.4)', () => {
    const ad = mkAd(0, { x: -8, z: -3 });
    ad.state = 'walking_back';
    ad.walker.visible = true;
    ad.walkTarget = { x: -20, z: 20 }; // di luar lantai
    ad._route = null;
    ad.walker.position.set(-12.3, 0, 9.3);
    const update = createMotion(mkCtx([ad]));
    update(2);
    expect(ad.walker.position.x).toBeGreaterThanOrEqual(-12.4);
    expect(ad.walker.position.x).toBeLessThanOrEqual(12.4);
    expect(ad.walker.position.z).toBeGreaterThanOrEqual(-9.4);
    expect(ad.walker.position.z).toBeLessThanOrEqual(9.4);
  });

  it('rute lintas band lewat gang: waypoint pertama koridor depan baris asal', () => {
    const ad = mkAd(0, { x: -4, z: -3 });
    ad.state = 'walking_out';
    ad.sittingChar.visible = false;
    ad.walker.visible = true;
    ad.walkTarget = { x: 0, z: 6 };
    ad.walker.position.set(-4, 0, -3); // baru keluar dari kursi
    ad._route = null;
    const update = createMotion(mkCtx([ad]));
    update(0.2); // 0.2s×1.6=0.32 unit ≥ 0.15 → capai koridor depan baris 0 (FRONT[0]=-4.15)
    expect(ad.walker.position.z).toBeLessThan(-3.01);  // keluar baris ke koridor depan (FRONT[0]=-4.15)
    expect(ad.walker.position.x).toBe(-4);             // dulu lurus keluar di x asal
  });
});

describe('createMotion — dispatch', () => {
  it('state tanpa handler (offsite/meeting) → diabaikan tanpa error', () => {
    const ad = mkAd(0);
    ad.state = 'offsite';
    const update = createMotion(mkCtx([ad]));
    expect(() => update(1)).not.toThrow();
    expect(ad.state).toBe('offsite');
  });
});
