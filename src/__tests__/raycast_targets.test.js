import { describe, it, expect } from 'vitest';
import {
  collectPickTargets,
  findAgentRoot,
  isNexusHit,
  isBoardHit,
} from '../scene/parts/raycast_targets.js';

// stub Object3D minimal: visible + parent chain + getObjectById
function node(name, { visible = true, parent = null, id = undefined } = {}) {
  const n = {
    name, visible, parent, id,
    _children: [],
    getObjectById(id) {
      for (const c of this._children) {
        if (c.id === id || c.getObjectById(id)) return c;
      }
      return null;
    },
  };
  return n;
}

describe('collectPickTargets', () => {
  it('mengembalikan array kosong untuk sumber kosong/null', () => {
    expect(collectPickTargets(null)).toEqual([]);
    expect(collectPickTargets({})).toEqual([]);
    expect(collectPickTargets({ agentData: null, board: null, whiteboard: null, nexus: null })).toEqual([]);
  });

  it('memasukkan agen yang visible (sittingChar/walker) dan melewatkan yang hidden', () => {
    const sit = node('sit'), walk = node('walk'), hid = node('hid', { visible: false });
    const out = collectPickTargets({ agentData: [{ sittingChar: sit, walker: walk, }, { sittingChar: hid, walker: hid }] });
    expect(out).toEqual([sit, walk]);
  });

  it('agen tanpa mesh (undefined/null) aman', () => {
    expect(collectPickTargets({ agentData: [{ sittingChar: null, walker: undefined }] })).toEqual([]);
  });

  it('menyertakan papan proyek mesh+frame bila ada', () => {
    const m = node('bm'), f = node('bf');
    const out = collectPickTargets({ board: { mesh: m, frame: f } });
    expect(out).toEqual([m, f]);
  });

  it('board hanya frame / mesh null → hanya frame', () => {
    const f = node('bf');
    expect(collectPickTargets({ board: { mesh: null, frame: f } })).toEqual([f]);
  });

  it('whiteboard mesh+frame disertakan setelah board', () => {
    const bm = node('bm'), bf = node('bf'), wm = node('wm'), wf = node('wf');
    const out = collectPickTargets({ board: { mesh: bm, frame: bf }, whiteboard: { mesh: wm, frame: wf } });
    expect(out).toEqual([bm, bf, wm, wf]);
  });

  it('nexus visible disertakan; nexus visible=false dikecualikan; nexus null aman', () => {
    const nx = node('nx');
    expect(collectPickTargets({ nexus: nx })).toEqual([nx]);
    expect(collectPickTargets({ nexus: { ...nx, visible: false } })).toEqual([]);
    expect(collectPickTargets({ nexus: null })).toEqual([]);
  });

  it('urutan lengkap: agen → board → whiteboard → nexus', () => {
    const sit = node('sit'), walk = node('walk'), bm = node('bm'), bf = node('bf'),
      wm = node('wm'), wf = node('wf'), nx = node('nx');
    const out = collectPickTargets({
      agentData: [{ sittingChar: sit, walker: walk }],
      board: { mesh: bm, frame: bf },
      whiteboard: { mesh: wm, frame: wf },
      nexus: nx,
    });
    expect(out).toEqual([sit, walk, bm, bf, wm, wf, nx]);
  });
});

describe('findAgentRoot', () => {
  it('hit langsung pada sittingChar/walker', () => {
    const sit = node('sit'), walk = node('walk');
    const ad = { sittingChar: sit, walker: walk };
    expect(findAgentRoot(sit, [ad])).toBe(ad);
    expect(findAgentRoot(walk, [ad])).toBe(ad);
  });

  it('hit pada anakan → naik rantai parent ke root agen', () => {
    const sit = node('sit');
    const child = node('torso', { parent: sit });
    const grand = node('arm', { parent: child });
    const ad = { sittingChar: sit, walker: node('walk') };
    expect(findAgentRoot(grand, [ad])).toBe(ad);
  });

  it('objek asing → null (termasuk null/undefined)', () => {
    const stranger = node('stranger');
    expect(findAgentRoot(stranger, [{ sittingChar: node('s'), walker: node('w') }])).toBe(null);
    expect(findAgentRoot(null, [])).toBe(null);
    expect(findAgentRoot(stranger, null)).toBe(null);
  });
});

describe('isNexusHit', () => {
  it('hit langsung & lewat getObjectById', () => {
    const nx = node('nx');
    const child = node('nx-hand', { id: 'hand' });
    nx._children.push(child);
    expect(isNexusHit(nx, nx)).toBe(true);
    expect(isNexusHit({ id: 'hand' }, nx)).toBe(true);
  });

  it('bukan nexus / nexus null / obj null → false', () => {
    const nx = node('nx');
    expect(isNexusHit(node('other'), nx)).toBe(false);
    expect(isNexusHit(nx, null)).toBe(false);
    expect(isNexusHit(null, nx)).toBe(false);
  });
});

describe('isBoardHit', () => {
  it('hit mesh langsung', () => {
    const m = node('m'), f = node('f');
    expect(isBoardHit(m, { mesh: m, frame: f })).toBe(true);
  });

  it('hit frame langsung & anakan frame via getObjectById', () => {
    const m = node('m'), f = node('f');
    f._children.push(node('card', { id: 'card' }));
    expect(isBoardHit(f, { mesh: m, frame: f })).toBe(true);
    expect(isBoardHit({ id: 'card' }, { mesh: m, frame: f })).toBe(true);
  });

  it('bukan papan / board null → false', () => {
    const m = node('m'), f = node('f');
    expect(isBoardHit(node('x'), { mesh: m, frame: f })).toBe(false);
    expect(isBoardHit(m, null)).toBe(false);
    expect(isBoardHit(null, { mesh: m })).toBe(false);
  });
});
