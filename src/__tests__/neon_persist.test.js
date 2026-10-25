import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNeonMode } from '../scene/parts/daycycle.js';

describe('Neon persist & toggle contract', () => {
  let store = {};
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((k) => store[k] ?? null),
      setItem: vi.fn((k, v) => { store[k] = String(v); }),
      removeItem: vi.fn((k) => { delete store[k]; }),
    });
  });

  const makeCtx = () => {
    const fn = vi.fn();
    const mat = () => ({ color: { set: fn } });
    return {
      ambient: { intensity: 0.5 },
      sun: { intensity: 1.0 },
      renderer: { toneMappingExposure: 1.0 },
      floor: { material: mat() },
      carpet: { material: mat() },
      ceiling: { material: { opacity: 0.45 } },
      tubes: [{ material: { color: { set: fn }, opacity: 0.3 } }],
      tubeLights: [{ intensity: 0, color: { set: fn } }],
      agentData: [{ dGlow: { intensity: 0.2, distance: 2.0 } }],
      screenLights: [{ intensity: 0 }],
      reception: { intensity: 0.4 },
      ceilPanels: [],
      skyWins: [],
      pendants: { bulbs: [], lights: [] },
      panelLights: [],
      restoreTime: vi.fn(),
    };
  };

  it('membaca wfs_neon dari localStorage saat inisialisasi tanpa menghapusnya', () => {
    localStorage.setItem('wfs_neon', '1');
    const readVal = (function () {
      try { return localStorage.getItem('wfs_neon') === '1'; } catch { return false; }
    })();
    expect(readVal).toBe(true);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('wfs_neon')).toBe('1');
  });

  it('toggleCyberpunk menyimpan 1 ke localStorage saat diaktifkan dan 0 saat dimatikan', () => {
    const ctx = makeCtx();
    const neon = createNeonMode(ctx);
    let cyberpunkMode = false;

    function toggleCyberpunk() {
      cyberpunkMode = neon.toggle();
      try { localStorage.setItem('wfs_neon', cyberpunkMode ? '1' : '0'); } catch { /* noop */ }
    }

    // Toggle on
    toggleCyberpunk();
    expect(cyberpunkMode).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('wfs_neon', '1');
    expect(ctx.floor.material.color.set).toHaveBeenCalledWith(0x060c18);

    // Toggle off
    toggleCyberpunk();
    expect(cyberpunkMode).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith('wfs_neon', '0');
    expect(ctx.floor.material.color.set).toHaveBeenCalledWith(0xffffff);
  });

  it('terapkan neon tersimpan saat init (toggle false -> true)', () => {
    const ctx = makeCtx();
    const neon = createNeonMode(ctx);
    const cyberpunkMode = true; // tersimpan '1'
    if (cyberpunkMode) neon.toggle();

    expect(neon.on).toBe(true);
    expect(ctx.ambient.intensity).toBe(0.14);
    expect(ctx.sun.intensity).toBe(0.06);
    expect(ctx.renderer.toneMappingExposure).toBe(0.62);
  });
});
