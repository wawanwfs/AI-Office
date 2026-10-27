import { describe, it, expect, vi } from 'vitest';
import { updateBubbles, disposeBubble } from '../scene/parts/bubbles.js';

function mkBubble({ life = 3.5, startY = 2, anchor = null, y0 = 2 } = {}) {
  return { life, startY, anchor, sprite: { position: { x: 0, y: y0, z: 0 }, material: { opacity: 0 } } };
}

describe('updateBubbles', () => {
  it('mengurangi life sebesar delta', () => {
    const b = mkBubble(); const bubbles = [b];
    updateBubbles(bubbles, 0.5, { remove: vi.fn() });
    expect(b.life).toBeCloseTo(3.0);
  });

  it('bubble dengan anchor MENDEKATI posisi pembicara secara mulus (bukan snap)', () => {
    const b = mkBubble({ anchor: { x: 5, z: -3, y: 2.6 } });
    // spawn tepat di anchor: frame pertama TETAP di posisi itu (tanpa lompatan)
    b.sprite.position.x = 5; b.sprite.position.z = -3; b.sprite.position.y = 2.6 + 1.35;
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.position.x).toBe(5);
    expect(b.sprite.position.z).toBe(-3);
    expect(b.sprite.position.y).toBeCloseTo(2.6 + 1.35 + (3 - 3.5) * .10);
    // anchor pindah → bubble mendekat bertahap, tidak teleport
    const far = mkBubble({ anchor: { x: 50, z: 50, y: 2.6 } });
    far.sprite.position.x = 0; far.sprite.position.z = 0; far.sprite.position.y = 3.95;
    updateBubbles([far], 0.05, { remove: vi.fn() });
    expect(far.sprite.position.x).toBeGreaterThan(0);
    expect(far.sprite.position.x).toBeLessThan(50); // belum sampai — gerak mulus
    // konvergen: setelah banyak frame kecil, sampai di anchor
    for (let f = 0; f < 200; f++) updateBubbles([far], 0.05, { remove: vi.fn() });
    expect(Math.abs(far.sprite.position.x - 50)).toBeLessThan(0.1);
  });

  it('anchor default y=2.0 bila tidak ada anchor.y (mendekati bertahap)', () => {
    const b = mkBubble({ anchor: { x: 1, z: 1 } });
    b.sprite.position.x = 1; b.sprite.position.z = 1; b.sprite.position.y = 2.0 + 1.35;
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.position.x).toBe(1);
    expect(b.sprite.position.z).toBe(1);
    expect(b.sprite.position.y).toBeCloseTo(2.0 + 1.35 + (3 - 3.5) * .10);
  });

  it('bubble tanpa anchor melayang naik dari startY seiring waktu', () => {
    const b = mkBubble({ startY: 4, anchor: null, life: 3.0 });
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.position.y).toBeCloseTo(4 + (3 - 3.0) * .12);
  });

  it('opacity = fade-in (age/.22) × fade-out (life/.5), di-clamp 0..1', () => {
    const b = mkBubble({ life: 3.5 }); // age=0 → fade-in 0
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.material.opacity).toBe(0);
  });

  it('puncak opacity: age≥.22 dan life≥.5 → opacity 1', () => {
    const b = mkBubble({ life: 2.0 }); // age = 1.5 ≥ .22, life ≥ .5
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.material.opacity).toBe(1);
  });

  it('fade-out: life kecil → opacity = life/.5', () => {
    const b = mkBubble({ life: 0.25 }); // age = 3.25 ≥ .22
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.material.opacity).toBeCloseTo(0.5);
  });

  it('bubble habis (life≤0) dihapus via remove dan dikeluarkan dari array', () => {
    const b = mkBubble({ life: 0.1 });
    const bubbles = [b];
    const remove = vi.fn();
    updateBubbles(bubbles, 0.2, { remove });
    expect(remove).toHaveBeenCalledWith(b);
    expect(bubbles.length).toBe(0);
  });

  it('iterasi mundur aman: beberapa bubble habis dalam satu frame', () => {
    const bubbles = [mkBubble({ life: 0.05 }), mkBubble({ life: 2 }), mkBubble({ life: 0 })];
    updateBubbles(bubbles, 0.1, { remove: vi.fn() });
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].life).toBeCloseTo(1.9);
  });

  it('bubble non-aktif tetap dihapus walau life persis 0 (boundary inklusif)', () => {
    const b = mkBubble({ life: 0 });
    const bubbles = [b];
    updateBubbles(bubbles, 0, { remove: vi.fn() });
    expect(bubbles.length).toBe(0);
  });

  it('guard anti-poisoning: delta non-finite (NaN/±Infinity/null/undefined) → no-op aman', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined]) {
      const b = mkBubble({ life: 3.5 });
      const bubbles = [b];
      updateBubbles(bubbles, bad, { remove: vi.fn() });
      expect(b.life).toBeCloseTo(3.5);       // life tak berubah (tak NaN/Infinity)
      expect(b.sprite.position.x).toBe(0);   // posisi tak jadi NaN
      expect(Number.isFinite(b.sprite.position.y)).toBe(true);
      expect(b.sprite.position.y).toBeCloseTo(2 + (3 - 3.5) * .12); // float-up rumus lama (life tetap)
      expect(b.sprite.material.opacity).toBe(0);
      expect(bubbles.length).toBe(1);        // tak terhapus
    }
  });

  it('delta negatif tidak korup: k dibatasi 0 (posisi diam), tak NaN', () => {
    const b = mkBubble({ life: 3.0 });
    updateBubbles([b], -0.5, { remove: vi.fn() });
    expect(b.sprite.position.x).toBe(0);               // x tak bergerak (k=0)
    expect(Number.isFinite(b.sprite.position.y)).toBe(true);
    expect(b.sprite.position.y).toBeCloseTo(2 + (3 - 3.5) * .12); // float-up rumus lama
    expect(b.life).toBeCloseTo(3.5);                  // life naik 0.5 (semantik lama)
  });

  it('guard anti-poisoning: life bubble non-finite (NaN/±Infinity) → dianggap habis & dihapus (tidak bocor/NaN)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const b = mkBubble({ life: bad });
      const bubbles = [b];
      const remove = vi.fn();
      updateBubbles(bubbles, 0.1, { remove });
      expect(remove).toHaveBeenCalledWith(b);
      expect(bubbles.length).toBe(0);
    }
  });

  it('guard anti-poisoning: anchor korup (koordinat non-finite) → fallback melayang naik dari startY, bukan posisi NaN', () => {
    const anchors = [
      { x: NaN, z: 1, y: 2.6 },
      { x: 1, z: Infinity, y: 2.6 },
      { x: 1, z: 1, y: NaN },
      { x: null, z: 1, y: 2.6 },
    ];
    for (const anchor of anchors) {
      const b = mkBubble({ life: 3.5, startY: 4, anchor });
      b.sprite.position.x = 7; b.sprite.position.z = -2; b.sprite.position.y = 5;
      updateBubbles([b], 0, { remove: vi.fn() });
      expect(b.sprite.position.x).toBe(7);                // posisi tak jadi NaN
      expect(b.sprite.position.z).toBe(-2);
      expect(Number.isFinite(b.sprite.position.y)).toBe(true);
      expect(b.sprite.position.y).toBeCloseTo(4 + (3 - 3.5) * .12); // float-up dari startY
      expect(Number.isFinite(b.sprite.material.opacity)).toBe(true);
    }
  });
});

describe('disposeBubble (siklus 122 — anti kebocoran tekstur GPU)', () => {
  const mkTex = () => {
    let n = 0;
    return { map: { dispose: () => { n++; } }, count: () => n };
  };

  it('map tekstur di-dispose SEBELUM material (urutan aman GPU)', () => {
    const tex = mkTex();
    const order = [];
    const b = { sprite: { material: {
      map: { dispose: () => order.push('map') },
      dispose: () => order.push('material'),
    } } };
    disposeBubble(b);
    expect(order).toEqual(['map', 'material']);
    expect(tex.count()).toBe(0); // tex dummy tak dipakai di case ini
  });

  it('material tanpa map tetap aman (map undefined/null)', () => {
    let matDisposed = false;
    const b = { sprite: { material: { dispose: () => { matDisposed = true; } } } };
    disposeBubble(b);
    expect(matDisposed).toBe(true);
  });

  it('null-safe: bubble/sprite/material korup tidak melempar exception', () => {
    expect(() => disposeBubble(null)).not.toThrow();
    expect(() => disposeBubble(undefined)).not.toThrow();
    expect(() => disposeBubble({})).not.toThrow();
    expect(() => disposeBubble({ sprite: null })).not.toThrow();
    expect(() => disposeBubble({ sprite: {} })).not.toThrow();
    expect(() => disposeBubble({ sprite: { material: null } })).not.toThrow();
    expect(() => disposeBubble({ sprite: { material: {} } })).not.toThrow();
    // map tanpa fungsi dispose (mock Korup) → dilewati, material tetap di-dispose
    let matDisposed = false;
    expect(() => disposeBubble({ sprite: { material: { map: {}, dispose: () => { matDisposed = true; } } } })).not.toThrow();
    expect(matDisposed).toBe(true);
  });

  it('jalur updateBubbles remove → disposeBubble membuang map + material', () => {
    const disposed = [];
    const b = mkBubble({ life: 0.05 });
    b.sprite.material.map = { dispose: () => disposed.push('map') };
    b.sprite.material.dispose = () => disposed.push('material');
    updateBubbles([b], 0.2, { remove: (bb) => { disposeBubble(bb); } });
    expect(disposed).toEqual(['map', 'material']);
  });
});
