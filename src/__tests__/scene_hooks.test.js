// purgeSceneHooks (parts/scene_hooks.js) — higiene hook window milik scene 3D
// (siklus 123: dulu destroy() hanya menghapus 10 dari ±45 hook → sisa hook
// menunjuk graph scene mati setelah remount/HMR; heap terkunci & SysMeter
// membaca hitungan agen basi).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_HOOKS, purgeSceneHooks } from '../scene/parts/scene_hooks.js';

describe('SCENE_HOOKS — daftar sumber kebenaran', () => {
  it('mencakup ≥45 hook scene (tak ada lagi penghapusan parsial)', () => {
    expect(SCENE_HOOKS.length).toBeGreaterThanOrEqual(45);
  });

  it('semua entri string diawali __ (konvensi hook scene)', () => {
    SCENE_HOOKS.forEach((k) => {
      expect(typeof k).toBe('string');
      expect(k.startsWith('__')).toBe(true);
    });
  });

  it('memuat hook inti yang dulu bocor di destroy() lama', () => {
    ['__agentData', '__cam', '__renderer', '__zoneLabels', '__zoneBase',
      '__wallFade', '__meetFigs', '__tvData', '__officeSound', '__scene',
    ].forEach((k) => expect(SCENE_HOOKS).toContain(k));
  });

  it('memuat SEMUA hook night-family & pedestal (siklus 242 — 13 hook dulu lupa terdaftar → hidup menunjuk graph mati pasca-destroy)', () => {
    ['__skyNight', '__skyCv', '__wallNight', '__wallTexCv',
      '__trimNight', '__trimMat', '__boardNight', '__boardMat',
      '__titleNight', '__titleCv', '__ceilNight', '__ceilMat', '__pedestal',
    ].forEach((k) => expect(SCENE_HOOKS).toContain(k));
  });

  it('cakupan lengkap: SETIAP assignment window.__* di OfficeScene + parts terdaftar (kecuali milik pemilik lain)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sceneDir = join(here, '../scene');
    const EXCLUDED = new Set(['THREE', '__officeSceneDestroyed']);
    const files = [join(sceneDir, 'OfficeScene.js'),
      ...readdirSync(join(sceneDir, 'parts')).map((f) => join(sceneDir, 'parts', f)),
    ].filter((f) => f.endsWith('.js'));
    const assigned = new Set();
    files.forEach((f) => {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/window\.([a-zA-Z0-9_]+)\s*=(?!=)/g)) {
        if (m[1].startsWith('__') && !EXCLUDED.has(m[1])) assigned.add(m[1]);
      }
    });
    expect(assigned.size).toBeGreaterThanOrEqual(60); // sanity: scanner benar-benar memindai
    const missing = [...assigned].filter((k) => !SCENE_HOOKS.includes(k));
    expect(missing).toEqual([]);
  });

  it('TIDAK memuat milik pemilik lain (App React / flag lintas-scene / global lib)', () => {
    ['__wfsAgentIdList', '__wfsSceneSelect', '__wfsSelectAgent',
      '__wfsModalOpen', '__escModalAtDispatch', '__openSettings',
      '__officeSceneDestroyed', 'THREE',
    ].forEach((k) => expect(SCENE_HOOKS).not.toContain(k));
  });

  it('tidak ada entri duplikat', () => {
    expect(new Set(SCENE_HOOKS).size).toBe(SCENE_HOOKS.length);
  });
});

describe('purgeSceneHooks — penghapusan & keamanan', () => {
  it('menghapus hanya hook scene yang ada di window; milik lain dibiarkan', () => {
    const win = { __scene: {}, __agentData: [], __cam: {}, __wfsAgentIdList: [], THREE: {} };
    const purged = purgeSceneHooks(win, SCENE_HOOKS);
    expect(purged).toContain('__scene');
    expect(purged).toContain('__agentData');
    expect(purged).toContain('__cam');
    expect(purged).not.toContain('__wfsAgentIdList'); // milik App — tak tersentuh
    expect(purged).not.toContain('THREE');
    expect('__scene' in win).toBe(false);
    expect('__agentData' in win).toBe(false);
    expect('__cam' in win).toBe(false);
    expect(win.__wfsAgentIdList).toEqual([]); // utuh
    expect(win.THREE).toBeDefined(); // utuh
  });

  it('idempoten: window sudah bersih → return [] tanpa error', () => {
    const win = {};
    expect(purgeSceneHooks(win, SCENE_HOOKS)).toEqual([]);
    expect(purgeSceneHooks(win, SCENE_HOOKS)).toEqual([]);
  });

  it('null-safe: win bukan objek / hooks null → []; hooks undefined = daftar penuh (default)', () => {
    expect(purgeSceneHooks(null, SCENE_HOOKS)).toEqual([]);
    expect(purgeSceneHooks(undefined, SCENE_HOOKS)).toEqual([]);
    expect(purgeSceneHooks('nope', SCENE_HOOKS)).toEqual([]);
    const win = { __scene: 1 };
    expect(purgeSceneHooks(win, null)).toEqual([]);       // null eksplisit → tidak ada yang dihapus
    expect(purgeSceneHooks(win, 'bukan-array')).toEqual([]);
    expect(win.__scene).toBe(1); // tak tersentuh
    // undefined eksplisit = default parameter → daftar penuh dipakai (semantik JS)
    expect(purgeSceneHooks({ __scene: 1 })).toEqual(['__scene']);
  });

  it('entri korup dalam daftar (non-string / kosong) diabaikan tanpa error', () => {
    const win = { __scene: 1, __cam: 2 };
    const purged = purgeSceneHooks(win, ['__scene', null, '', 42, '__cam', undefined]);
    expect(purged).toEqual(['__scene', '__cam']);
  });

  it('properti di prototipe (bukan own) TIDAK di-delete & tak masuk hasil', () => {
    const proto = { __inherited: 1 };
    const win = Object.create(proto);
    win.__scene = 1;
    const purged = purgeSceneHooks(win, SCENE_HOOKS);
    expect(purged).toEqual(['__scene']);
    expect(win.__inherited).toBe(1); // prototipe tak tersentuh
  });

  it('semua SCENE_HOOKS valid dipakai utk window penuh → habis terhapus', () => {
    const win = {};
    SCENE_HOOKS.forEach((k) => { win[k] = {}; });
    const purged = purgeSceneHooks(win, SCENE_HOOKS);
    expect(purged.length).toBe(SCENE_HOOKS.length);
    SCENE_HOOKS.forEach((k) => expect(k in win).toBe(false));
  });
});
