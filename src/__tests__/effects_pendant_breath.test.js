import { describe, it, expect } from 'vitest';
import { pendantBreath, PENDANT_SEC } from '../scene/parts/effects.js';
import { createCeilingFixtures } from '../scene/parts/room.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

// Stub THREE minimal untuk createCeilingFixtures (pola test 497)
function makeStubTHREE() {
  const Mesh = class {
    constructor(geo, mat) { this.geometry = geo; this.material = mat; this.userData = {}; this.isMesh = true; this.position = { set() {} }; this.rotation = { set() {} }; }
  };
  const PointLight = class {
    constructor(color, intensity) { this.color = { set() {} }; this.intensity = intensity; this.userData = {}; this.position = { set() {} }; }
  };
  const Box = class { constructor() {} };
  const added = [];
  const office = { add: (m) => added.push(m), traverse() {} };
  return { THREE: { Mesh, PointLight, BoxGeometry: Box }, office, added };
}

describe('pendantBreath (siklus 503)', () => {
  it('guard nilai non-finite → netral 0.83 tanpa melempar', () => {
    // t=0: main=0.5, micro=0.5 → 0.70+0.12+0.03 = 0.85
    near(pendantBreath(NaN), 0.85);
    near(pendantBreath(undefined), 0.85);
    expect(Number.isFinite(pendantBreath(Infinity))).toBe(true);
  });

  it('bernapas — tak padam total, rentang 0.70…1.0', () => {
    const N = 600;
    const vals = Array.from({ length: N }, (_, i) => pendantBreath(i * 0.03));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.70 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.25);
  });

  it('deterministik + periodik: kontinu di seam 247T (2.47 exact)', () => {
    near(pendantBreath(1.1), pendantBreath(1.1));
    [0.4, 1.7, 3.1].forEach((t) => {
      near(pendantBreath(t), pendantBreath(t + PENDANT_SEC * 247), 1e-6);
    });
    expect(PENDANT_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: puncak main eksak, lembah di bawah 0.9 tapi tak padam', () => {
    const p = pendantBreath(PENDANT_SEC / 4);
    near(p, 0.70 + 0.24 + 0.06 * wAt(PENDANT_SEC / 4, PENDANT_SEC * 2.47), 1e-9);
    const valley = pendantBreath(PENDANT_SEC * 3 / 4);
    expect(valley).toBeLessThan(0.9);
    expect(valley).toBeGreaterThan(0.70);
  });

  it('fase tak sinkron vs lampu lounge 5.2 / floor 4.3 / reception 3.6 / tube 5.6', () => {
    for (const sec of [5.2, 4.3, 3.9, 3.6, 5.6, 2.9]) {
      expect(Math.abs(PENDANT_SEC - sec) / sec).toBeGreaterThan(0.04);
    }
  });

  it('mikro-gelombang menambah tekstur di puncak main', () => {
    const a = pendantBreath(PENDANT_SEC / 4);
    const b = pendantBreath(PENDANT_SEC / 4 + PENDANT_SEC * 2.47 / 2);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.70);
  });

  it('integrasi createCeilingFixtures: bulbs & lights terekspor utk napas', () => {
    const { THREE, office } = makeStubTHREE();
    const M = () => ({ color: { set() {} } });
    const MB = () => ({ color: { set() {} } });
    const rt = createCeilingFixtures({ THREE, office, M, MB }, [{ x: 0, z: 0 }, { x: 2, z: 0 }]);
    expect(rt.pendBulbs.length).toBe(2);
    expect(rt.pendLights.length).toBe(2);
    expect(rt.pendLights[0].intensity).toBeCloseTo(0.15, 12);
    expect(rt.pendBulbs[0].userData.__pendBulb).toBe(true);
    expect(rt.pendLights[0].userData.__pendLight).toBe(true);
    // guard stub tanpa userData tidak melempar saat paintCeilNight
    expect(typeof rt.paintCeilNight).toBe('function');
    expect(rt.paintCeilNight(true)).toBe(0); // office.traverse stub → 0
  });
});

function wAt(t, sec) {
  return 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
}
