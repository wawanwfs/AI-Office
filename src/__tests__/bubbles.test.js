import { describe, it, expect, vi } from 'vitest';
import { updateBubbles } from '../scene/parts/bubbles.js';

function mkBubble({ life = 3.5, startY = 2, anchor = null, y0 = 2 } = {}) {
  return { life, startY, anchor, sprite: { position: { x: 0, y: y0, z: 0 }, material: { opacity: 0 } } };
}

describe('updateBubbles', () => {
  it('mengurangi life sebesar delta', () => {
    const b = mkBubble(); const bubbles = [b];
    updateBubbles(bubbles, 0.5, { remove: vi.fn() });
    expect(b.life).toBeCloseTo(3.0);
  });

  it('bubble dengan anchor mengikuti posisi x/z pembicara', () => {
    const b = mkBubble({ anchor: { x: 5, z: -3, y: 2.6 } });
    updateBubbles([b], 0, { remove: vi.fn() });
    expect(b.sprite.position.x).toBe(5);
    expect(b.sprite.position.z).toBe(-3);
    expect(b.sprite.position.y).toBeCloseTo(2.6 + 1.35 + (3 - 3.5) * .10);
  });

  it('anchor default y=2.0 bila tidak ada anchor.y', () => {
    const b = mkBubble({ anchor: { x: 1, z: 1 } });
    updateBubbles([b], 0, { remove: vi.fn() });
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
});
