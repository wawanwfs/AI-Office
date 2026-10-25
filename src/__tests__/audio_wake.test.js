// Unit test audio_wake (src/scene/parts/audio_wake.js) — listener sekali-pakai
// yang membangunkan AudioContext pada interaksi pertama, dengan dispose simetris
// (regresi: listener lama tak dilepas di destroy() → engine audio scene lama
// ikut terbangun saat remount → AudioContext bocor).
import { describe, it, expect, vi } from 'vitest';
import { installAudioWake } from '../scene/parts/audio_wake.js';

function fakeWindow() {
  const listeners = new Map();
  const win = {
    addEventListener: vi.fn((type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn });
    }),
    removeEventListener: vi.fn((type, fn) => {
      const arr = listeners.get(type) || [];
      const i = arr.findIndex(l => l.fn === fn);
      if (i >= 0) arr.splice(i, 1);
    }),
    dispatch(type) {
      (listeners.get(type) || []).slice().forEach(l => l.fn({ type }));
    },
    count(type) { return (listeners.get(type) || []).length; },
  };
  return win;
}

describe('installAudioWake', () => {
  it('memasang keydown + pointerdown once, memicu ensure pada interaksi pertama', () => {
    const win = fakeWindow();
    const ensure = vi.fn();
    const dispose = installAudioWake(ensure, { window: win });
    expect(win.count('keydown')).toBe(1);
    expect(win.count('pointerdown')).toBe(1);
    win.dispatch('keydown');
    expect(ensure).toHaveBeenCalledTimes(1);
    // sekali-pakai: otomatis hilang setelah terpicu
    expect(win.count('keydown')).toBe(0);
    win.dispatch('keydown');
    win.dispatch('pointerdown');
    expect(ensure).toHaveBeenCalledTimes(1); // tak dobel
    expect(dispose).toBeTypeOf('function');
  });

  it('dispose sebelum interaksi → listener dilepas, ensure TIDAK pernah dipanggil (regresi leak)', () => {
    const win = fakeWindow();
    const ensure = vi.fn();
    const dispose = installAudioWake(ensure, { window: win });
    dispose();
    expect(win.count('keydown')).toBe(0);
    expect(win.count('pointerdown')).toBe(0);
    win.dispatch('keydown');
    win.dispatch('pointerdown');
    expect(ensure).not.toHaveBeenCalled();
  });

  it('dispose idempoten (dua kali aman) & setelah terpicu tetap no-op', () => {
    const win = fakeWindow();
    const ensure = vi.fn();
    const dispose = installAudioWake(ensure, { window: win });
    expect(() => { dispose(); dispose(); }).not.toThrow();
    win.dispatch('pointerdown');
    expect(ensure).not.toHaveBeenCalled();
  });

  it('ensure melempar exception → tertelan (interaksi wake tak boleh crash UI)', () => {
    const win = fakeWindow();
    const dispose = installAudioWake(() => { throw new Error('ctx closed'); }, { window: win });
    expect(() => win.dispatch('pointerdown')).not.toThrow();
    expect(dispose).toBeTypeOf('function');
  });

  it('tanpa window / ensureFn bukan fungsi → no-op aman (SSR/jsdom aneh)', () => {
    expect(() => installAudioWake(() => {}, { window: null })).not.toThrow();
    expect(() => installAudioWake(null, { window: fakeWindow() })).not.toThrow();
  });
});
