// Wake Lock manager (src/lib/wakelock.js) — navigator disuntikkan, murni diuji.
import { describe, it, expect } from 'vitest';
import { createWakeLockManager } from '../lib/wakelock.js';

const sentinel = () => {
  const s = { released: false, releaseCalls: 0, handlers: {} };
  s.release = function () { s.released = true; s.releaseCalls++; };
  s.addEventListener = function (ev, fn) { s.handlers[ev] = fn; };
  return s;
};
const navWith = (requestImpl) => ({ wakeLock: { request: requestImpl } });

describe('createWakeLockManager — unsupported', () => {
  it('tanpa navigator.wakeLock → state "unsupported", tanpa error', async () => {
    const states = [];
    const m = createWakeLockManager({}, { onState: s => states.push(s) });
    expect(m.state()).toBe('unsupported');
    expect(states).toEqual(['unsupported']);
    await expect(m.acquire()).resolves.toBe('unsupported');
    expect(m.state()).toBe('unsupported');
    await m.release(); // tidak throw
  });
  it('nav null juga aman', () => {
    const m = createWakeLockManager(null);
    expect(m.state()).toBe('unsupported');
  });
});

describe('createWakeLockManager — acquire/release', () => {
  it('acquire → held, request("screen"); release → released', async () => {
    const s = sentinel();
    const req = () => Promise.resolve(s);
    const m = createWakeLockManager(navWith(req), {});
    await m.acquire();
    expect(m.state()).toBe('held');
    await m.release();
    expect(m.state()).toBe('released');
    expect(s.releaseCalls).toBe(1);
  });
  it('onState dipicu saat acquire & release', async () => {
    const s = sentinel();
    const states = [];
    const m = createWakeLockManager(navWith(() => Promise.resolve(s)), {
      onState: st => states.push(st),
    });
    await m.acquire();
    expect(states).toContain('held');
    await m.release();
    expect(states).toContain('released');
  });
  it('sudah held → acquire tidak minta lagi (idempoten)', async () => {
    const s = sentinel();
    let calls = 0;
    const m = createWakeLockManager(navWith(() => { calls++; return Promise.resolve(s); }), {});
    await m.acquire();
    await m.acquire();
    expect(calls).toBe(1);
    expect(m.state()).toBe('held');
  });
  it('request menolak (NotAllowedError) → state tetap released, tidak throw', async () => {
    const m = createWakeLockManager(navWith(() => Promise.reject(new Error('NotAllowedError'))), {});
    await expect(m.acquire()).resolves.toBe('released');
    expect(m.state()).toBe('released');
  });
});

describe('createWakeLockManager — auto-release browser (visibilitychange)', () => {
  it('event release dari sentinel → lock dinolkan & state released, reacquire minta sentinel baru', async () => {
    const s1 = sentinel();
    const s2 = sentinel();
    const sentinels = [s1, s2];
    let i = 0;
    const m = createWakeLockManager(navWith(() => Promise.resolve(sentinels[i++])), {});
    await m.acquire();
    expect(m.state()).toBe('held');
    // simulasikan browser melepas lock (tab hidden)
    s1.handlers.release();
    expect(m.state()).toBe('released');
    // reacquire harus minta sentinel BARU (bukan ulang yang lama)
    await m.acquire();
    expect(i).toBe(2);
    expect(m.state()).toBe('held');
  });
});
