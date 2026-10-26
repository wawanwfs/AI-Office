import { describe, it, expect } from 'vitest';
import { agentIdMap, buildRunningByAgent, resolveAgentId, SCENE_NAME_TO_ID } from '../scene/parts/running_tasks.js';

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
  it('entri agents dgn data null/undefined tidak melempar (guard konsisten dgn wakeAgentIds/failedAlerts)', () => {
    expect(() => buildRunningByAgent({ be1: null, qa1: undefined }, [])).not.toThrow();
    expect(buildRunningByAgent({ be1: null, qa1: undefined }, [])).toEqual({});
    const m = buildRunningByAgent({ be1: null, fe1: { running: 2 } }, []);
    expect(m.fe1).toEqual({ id: '?', title: 'mengerjakan', n: 2 });
    expect(m.be1).toBeUndefined();
  });
});

describe('resolveAgentId (resolusi identitas agen & gateway ID)', () => {
  it('memetakan nama adegan 3D historis ke ID gateway yang tepat', () => {
    expect(resolveAgentId('BUDI', null)).toBe('be1');
    expect(resolveAgentId('RIZKY', null)).toBe('be2');
    expect(resolveAgentId('DEWI', null)).toBe('fe1');
    expect(resolveAgentId('ANDI', null)).toBe('fe2');
    expect(resolveAgentId('TONI', null)).toBe('devops1');
    expect(resolveAgentId('RINA', null)).toBe('qa1');
    expect(resolveAgentId('SARI', null)).toBe('pm1');
    expect(resolveAgentId('WAHYU FS', null)).toBe('ceo');
    expect(resolveAgentId('CEO', null)).toBe('ceo');
  });

  it('memetakan 12 spesialis kampus multi-lantai ke ID spesialis', () => {
    expect(resolveAgentId('ARIS', null)).toBe('arch1');
    expect(resolveAgentId('CLARA', null)).toBe('ux2');
    expect(resolveAgentId('RIAN', null)).toBe('prod1');
    expect(resolveAgentId('TARI', null)).toBe('dsgn1');
    expect(resolveAgentId('FERRY', null)).toBe('db1');
    expect(resolveAgentId('GILANG', null)).toBe('be-lead');
    expect(resolveAgentId('HENDRA', null)).toBe('infra1');
    expect(resolveAgentId('DONI', null)).toBe('sre1');
    expect(resolveAgentId('SECBOT', null)).toBe('sec1');
    expect(resolveAgentId('BAGAS', null)).toBe('secops1');
    expect(resolveAgentId('NINA', null)).toBe('rel1');
    expect(resolveAgentId('CITRA', null)).toBe('gov1');
  });

  it('memprioritaskan entri dari list dinamis / map aktual', () => {
    const list = [
      { name: 'Budi Santoso', id: 'be1' },
      { name: 'Wahyu Fajar S.', id: 'ceo' },
      { name: 'Special Agent X', id: 'custom-99' },
    ];
    expect(resolveAgentId('Budi', list)).toBe('be1');
    expect(resolveAgentId('Special Agent X', list)).toBe('custom-99');
    expect(resolveAgentId('Wahyu Fajar S.', list)).toBe('ceo');
  });

  it('null/kosong mengembalikan null', () => {
    expect(resolveAgentId(null, null)).toBeNull();
    expect(resolveAgentId('', null)).toBeNull();
  });
});
