import { describe, it, expect } from 'vitest';
import { BADGE_COLORS, badgeAssignments, wakeAgentIds, failedAlerts } from '../src/scene/parts/status_poll.js';

describe('status_poll: BADGE_COLORS', () => {
  it('palette persis kode lama', () => {
    expect(BADGE_COLORS).toEqual({
      done: '#10E5A0', running: '#f59e0b', failed: '#f66',
      review: '#59a5ff', pending: '#8b93a3',
    });
  });
});

describe('status_poll: badgeAssignments', () => {
  const im = { Alice: 'a1', Bob: 'a2' };
  const mk = (name, hasBadge = true) => ({
    agent: { name },
    sittingChar: hasBadge ? { userData: { badge: { material: { color: { set: () => {} } } } } } : { userData: {} },
  });
  const agents = { a1: { last: 'running' }, a2: { last: 'weird' } };

  it('entri valid: status punya warna & badge ada', () => {
    const out = badgeAssignments([mk('Alice'), mk('Bob')], agents, im);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ gid: 'a1', status: 'running' });
  });
  it('status tanpa warna diabaikan', () => {
    expect(badgeAssignments([mk('Bob')], agents, im)).toHaveLength(0);
  });
  it('agent tanpa badge diabaikan', () => {
    expect(badgeAssignments([mk('Alice', false)], agents, im)).toHaveLength(0);
  });
  it('gid tak dikenal / agents null aman', () => {
    expect(badgeAssignments([mk('Zed')], agents, im)).toHaveLength(0);
    expect(badgeAssignments([mk('Alice')], null, im)).toHaveLength(0);
  });
  it('agentData null aman', () => {
    expect(badgeAssignments(null, agents, im)).toEqual([]);
  });
});

describe('status_poll: wakeAgentIds', () => {
  it('running>0 masuk daftar', () => {
    expect(wakeAgentIds({ a: { running: 2 }, b: { running: 0 }, c: { running: 1 } })).toEqual(['a', 'c']);
  });
  it('running hilang/null diabaikan', () => {
    expect(wakeAgentIds({ a: {}, b: null })).toEqual([]);
  });
  it('null aman', () => {
    expect(wakeAgentIds(null)).toEqual([]);
  });
});

describe('status_poll: failedAlerts', () => {
  const find = (gid) => (gid === 'a' ? { tag: 'A' } : gid === 'b' ? { tag: 'B' } : null);
  it('transisi naik memicu alert & update prevFailed', () => {
    const pf = { a: 1 };
    const out = failedAlerts({ a: { failed: 2 }, b: { failed: 1 } }, pf, find);
    expect(out).toEqual([{ gid: 'a', ad: { tag: 'A' } }, { gid: 'b', ad: { tag: 'B' } }]);
    expect(pf).toEqual({ a: 2, b: 1 });
  });
  it('jumlah sama tidak memicu ulang', () => {
    const pf = { a: 2 };
    expect(failedAlerts({ a: { failed: 2 } }, pf, find)).toEqual([]);
  });
  it('failed=0 reset prevFailed ke 0', () => {
    const pf = { a: 2 };
    expect(failedAlerts({ a: { failed: 0 } }, pf, find)).toEqual([]);
    expect(pf.a).toBe(0);
  });
  it('entri tanpa failed direset juga (cabang !v)', () => {
    const pf = { b: 3 };
    failedAlerts({ b: null }, pf, find);
    expect(pf.b).toBe(0);
  });
  it('agent tak ditemukan di-skip tapi prevFailed tetap tercatat', () => {
    const pf = {};
    const out = failedAlerts({ z: { failed: 5 } }, pf, find);
    expect(out).toEqual([]);
    expect(pf.z).toBe(5);
  });
  it('agents null aman', () => {
    expect(failedAlerts(null, {}, find)).toEqual([]);
  });
});
