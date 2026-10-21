import { describe, it, expect } from 'vitest';
import { agentIdMap, buildRunningByAgent } from '../scene/parts/running_tasks.js';

describe('agentIdMap (murni, diekstrak pollRunning)', () => {
  it('memetakan nama→id', () => {
    expect(agentIdMap([{ name: 'sbx-be1', id: 'be1' }, { name: 'qa1', id: 'qa1' }]))
      .toEqual({ 'sbx-be1': 'be1', qa1: 'qa1' });
  });
  it('null/undefined → objek kosong (fallback kode lama)', () => {
    expect(agentIdMap(null)).toEqual({});
    expect(agentIdMap(undefined)).toEqual({});
  });
  it('list kosong → kosong', () => {
    expect(agentIdMap([])).toEqual({});
  });
});

describe('buildRunningByAgent (murni, diekstrak pollRunning)', () => {
  const AG = { be1: { running: 2 }, qa1: { running: 0 }, fe1: { running: 1 } };

  it('running>0 → entri awal id:"?" title:"mengerjakan" n sesuai', () => {
    const m = buildRunningByAgent(AG, []);
    expect(m.be1).toEqual({ id: '?', title: 'mengerjakan', n: 2 });
    expect(m.fe1).toEqual({ id: '?', title: 'mengerjakan', n: 1 });
  });
  it('running=0 tidak masuk map', () => {
    expect(buildRunningByAgent(AG, []).qa1).toBeUndefined();
  });
  it('task status running menimpa id & title, n dipertahankan', () => {
    const tasks = [
      { agent_id: 'be1', status: 'running', id: 42, title: 'Fix bug chat' },
      { agent_id: 'be1', status: 'done', id: 41, title: 'Lain' }, // bukan running → diabaikan
      { agent_id: 'qa1', status: 'running', id: 9, title: 'x' }, // qa1 running=0 → diabaikan
    ];
    const m = buildRunningByAgent(AG, tasks);
    expect(m.be1).toEqual({ id: 42, title: 'Fix bug chat', n: 2 });
    expect(m.fe1).toEqual({ id: '?', title: 'mengerjakan', n: 1 });
  });
  it('tasks berbentuk {tasks:[...]} ikut diproses (kompatibilitas respons)', () => {
    const m = buildRunningByAgent(AG, { tasks: [{ agent_id: 'fe1', status: 'running', id: 7, title: 'T' }] });
    expect(m.fe1).toEqual({ id: 7, title: 'T', n: 1 });
  });
  it('respons non-array tanpa .tasks → aman (fallback kode lama)', () => {
    expect(buildRunningByAgent(AG, { error: 'x' })).toEqual({ be1: { id: '?', title: 'mengerjakan', n: 2 }, fe1: { id: '?', title: 'mengerjakan', n: 1 } });
  });
  it('agents null → map kosong', () => {
    expect(buildRunningByAgent(null, [])).toEqual({});
  });
  it('semua running=0 & task kosong → kosong', () => {
    expect(buildRunningByAgent({ qa1: { running: 0 } }, [])).toEqual({});
  });
});
