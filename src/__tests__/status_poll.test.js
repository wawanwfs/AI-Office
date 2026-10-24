import { describe, it, expect } from 'vitest';
import { BADGE_COLORS, badgeAssignments, wakeAgentIds, failedAlerts, statusPollActions } from '../scene/parts/status_poll.js';

const agent = (name, hex = '#f59e0b') => ({ name, hex });
const mkAgentData = (name, gid, opts = {}) => ({
  agent: agent(name),
  sittingChar: { userData: { badge: opts.badge !== undefined ? opts.badge : {} } },
});
const im = { wawan: 'wawan', toni: 'toni' };
const findByGid = (gid) => (gid === 'wawan' ? 'AD-wawan' : gid === 'toni' ? 'AD-toni' : null);

describe('BADGE_COLORS', () => {
  it('menyediakan warna untuk semua status yang dikenal', () => {
    ['done', 'running', 'failed', 'review', 'pending'].forEach((s) =>
      expect(BADGE_COLORS[s]).toMatch(/^#[0-9a-f]{3,6}$/i));
  });
});

describe('badgeAssignments', () => {
  it('memetakan status gateway ke agent dengan badge', () => {
    const agentData = [mkAgentData('wawan'), mkAgentData('toni')];
    const agents = { wawan: { last: 'done', running: 0 }, toni: { last: 'failed', running: 0 } };
    const out = badgeAssignments(agentData, agents, im);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ gid: 'wawan', status: 'done' });
    expect(out[1]).toMatchObject({ gid: 'toni', status: 'failed' });
  });

  it('melewatkan agent tanpa gid im / badge / status tak dikenal', () => {
    const agentData = [mkAgentData('stranger'), mkAgentData('wawan', 'wawan', { badge: null })];
    const agents = { wawan: { last: 'running' } };
    expect(badgeAssignments(agentData, agents, im)).toHaveLength(0);
  });

  it('aman terhadap agentData null', () => {
    expect(badgeAssignments(null, { wawan: { last: 'done' } }, im)).toEqual([]);
  });
});

describe('wakeAgentIds', () => {
  it('mengembalikan gid yang running > 0', () => {
    const agents = { wawan: { running: 1 }, toni: { running: 0 }, be1: { running: 3 } };
    expect(wakeAgentIds(agents).sort()).toEqual(['be1', 'wawan']);
  });
  it('aman terhadap null', () => expect(wakeAgentIds(null)).toEqual([]));
});

describe('failedAlerts', () => {
  it('memberi alert saat failed naik dan mengenali transisi', () => {
    const prev = {};
    const agents = { wawan: { failed: 2 }, toni: { failed: 0 } };
    let out = failedAlerts(agents, prev, findByGid);
    expect(out).toEqual([{ gid: 'wawan', ad: 'AD-wawan' }]);
    // jumlah failed sama → tidak alert ulang
    out = failedAlerts(agents, prev, findByGid);
    expect(out).toEqual([]);
    // failed naik → alert lagi
    agents.wawan.failed = 3;
    out = failedAlerts(agents, prev, findByGid);
    expect(out).toEqual([{ gid: 'wawan', ad: 'AD-wawan' }]);
  });
  it('reset prevFailed saat failed kembali 0', () => {
    const prev = { wawan: 2 };
    const agents = { wawan: { failed: 0 } };
    failedAlerts(agents, prev, findByGid);
    expect(prev.wawan).toBe(0);
  });
  it('aman terhadap null', () => expect(failedAlerts(null, {}, findByGid)).toEqual([]));
});

describe('statusPollActions', () => {
  it('menggabungkan badge, wake, dan alert dalam satu langkah', () => {
    const agentData = [mkAgentData('wawan'), mkAgentData('toni')];
    const agents = { wawan: { last: 'review', running: 1, failed: 1 }, toni: { last: 'done', running: 0, failed: 0 } };
    const prev = {};
    const out = statusPollActions(agentData, agents, im, prev, findByGid);
    expect(out).toContainEqual({ type: 'badge', ad: agentData[0], status: 'review', color: BADGE_COLORS.review });
    expect(out).toContainEqual({ type: 'badge', ad: agentData[1], status: 'done', color: BADGE_COLORS.done });
    expect(out).toContainEqual({ type: 'wake', gid: 'wawan', ad: 'AD-wawan' });
    expect(out).toContainEqual({ type: 'alert', gid: 'wawan', ad: 'AD-wawan' });
    // tanpa failed baru kedua kalinya → hanya badge + wake
    const out2 = statusPollActions(agentData, agents, im, prev, findByGid);
    expect(out2.some((a) => a.type === 'alert')).toBe(false);
  });
});
