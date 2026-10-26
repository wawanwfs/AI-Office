import { describe, it, expect } from 'vitest';
import {
  KANBAN_COLUMNS,
  ROLE_COLORS,
  getTaskRoleBadgeColor,
  getKanbanColumnKey,
  groupTasksByKanbanColumn,
  computeSprintMetrics,
  filterTasks,
} from '../scene/parts/kanban_spec.js';

describe('kanban_spec — KANBAN_COLUMNS & role badges', () => {
  it('mengekspor 4 kolom kanban baku dengan urutan logis', () => {
    expect(KANBAN_COLUMNS).toHaveLength(4);
    const keys = KANBAN_COLUMNS.map(c => c.key);
    expect(keys).toEqual(['pending', 'running', 'review', 'done']);
    KANBAN_COLUMNS.forEach(col => {
      expect(col.label).toBeTruthy();
      expect(col.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(col.icon).toBeTruthy();
      expect(col.bg).toBeTruthy();
      expect(col.desc).toBeTruthy();
    });
  });

  it('memberikan warna badge peran secara spesifik dan fallback aman', () => {
    expect(getTaskRoleBadgeColor('be')).toBe(ROLE_COLORS.be);
    expect(getTaskRoleBadgeColor('fe')).toBe(ROLE_COLORS.fe);
    expect(getTaskRoleBadgeColor('ops')).toBe(ROLE_COLORS.ops);
    expect(getTaskRoleBadgeColor('qa')).toBe(ROLE_COLORS.qa);
    expect(getTaskRoleBadgeColor('pm')).toBe(ROLE_COLORS.pm);
    expect(getTaskRoleBadgeColor('ai')).toBe(ROLE_COLORS.ai);
    expect(getTaskRoleBadgeColor('UNKNOWN_ROLE')).toBe('#64748B');
    expect(getTaskRoleBadgeColor(null)).toBe('#64748B');
    expect(getTaskRoleBadgeColor(undefined)).toBe('#64748B');
  });
});

describe('kanban_spec — getKanbanColumnKey', () => {
  it('memetakan variasi status ke kolom yang tepat', () => {
    expect(getKanbanColumnKey('running')).toBe('running');
    expect(getKanbanColumnKey('in_progress')).toBe('running');
    expect(getKanbanColumnKey('active')).toBe('running');

    expect(getKanbanColumnKey('done')).toBe('done');
    expect(getKanbanColumnKey('completed')).toBe('done');
    expect(getKanbanColumnKey('finished')).toBe('done');

    expect(getKanbanColumnKey('review')).toBe('review');
    expect(getKanbanColumnKey('qa')).toBe('review');
    expect(getKanbanColumnKey('failed')).toBe('review');
    expect(getKanbanColumnKey('error')).toBe('review');
    expect(getKanbanColumnKey('issue')).toBe('review');

    expect(getKanbanColumnKey('pending')).toBe('pending');
    expect(getKanbanColumnKey('queued')).toBe('pending');
    expect(getKanbanColumnKey('waiting')).toBe('pending');
    expect(getKanbanColumnKey('')).toBe('pending');
    expect(getKanbanColumnKey(null)).toBe('pending');
  });
});

describe('kanban_spec — groupTasksByKanbanColumn', () => {
  const sampleTasks = [
    { id: 1, title: 'DB Schema', status: 'done', role: 'be', agent_id: 'be1' },
    { id: 2, title: 'API Gateway', status: 'running', role: 'be', agent_id: 'be2' },
    { id: 3, title: 'UI Dashboard', status: 'pending', role: 'fe', agent_id: 'fe1' },
    { id: 4, title: 'Integration Test', status: 'review', role: 'qa', agent_id: 'qa1' },
    { id: 5, title: 'Worker Redis', status: 'failed', role: 'ops', agent_id: 'ops1' },
    { id: 6, title: 'OAuth Flow', status: 'done', role: 'be', agent_id: 'be1' },
  ];

  it('mengelompokkan task ke kolom yang tepat dan urut ID descending', () => {
    const grouped = groupTasksByKanbanColumn(sampleTasks);
    expect(grouped.pending).toHaveLength(1);
    expect(grouped.pending[0].id).toBe(3);

    expect(grouped.running).toHaveLength(1);
    expect(grouped.running[0].id).toBe(2);

    expect(grouped.review).toHaveLength(2);
    // id: 5 (failed) and id: 4 (review) sorted descending
    expect(grouped.review[0].id).toBe(5);
    expect(grouped.review[1].id).toBe(4);

    expect(grouped.done).toHaveLength(2);
    expect(grouped.done[0].id).toBe(6);
    expect(grouped.done[1].id).toBe(1);
  });

  it('menerapkan filter query pencarian pada kelompok kanban', () => {
    const grouped = groupTasksByKanbanColumn(sampleTasks, 'fe1');
    expect(grouped.pending).toHaveLength(1);
    expect(grouped.running).toHaveLength(0);
    expect(grouped.review).toHaveLength(0);
    expect(grouped.done).toHaveLength(0);

    const grouped2 = groupTasksByKanbanColumn(sampleTasks, 'be1');
    expect(grouped2.done).toHaveLength(2);
  });

  it('toleran terhadap input null, undefined, atau array kosong', () => {
    const g1 = groupTasksByKanbanColumn(null);
    expect(g1.pending).toEqual([]);
    expect(g1.running).toEqual([]);
    expect(g1.review).toEqual([]);
    expect(g1.done).toEqual([]);

    const g2 = groupTasksByKanbanColumn([]);
    expect(g2.done).toEqual([]);
  });
});

describe('kanban_spec — computeSprintMetrics & filterTasks', () => {
  const sampleTasks = [
    { id: 1, title: 'Task 1', status: 'done', role: 'be', agent_id: 'be1' },
    { id: 2, title: 'Task 2', status: 'done', role: 'be', agent_id: 'be2' },
    { id: 3, title: 'Task 3', status: 'running', role: 'fe', agent_id: 'fe1' },
    { id: 4, title: 'Task 4', status: 'review', role: 'qa', agent_id: 'qa1' },
    { id: 5, title: 'Task 5', status: 'failed', role: 'ops', agent_id: 'ops1' },
    { id: 6, title: 'Task 6', status: 'pending', role: 'fe', agent_id: 'fe2' },
  ];

  it('menghitung metrik agregat sprint secara tepat', () => {
    const m = computeSprintMetrics(sampleTasks);
    expect(m.total).toBe(6);
    expect(m.done).toBe(2);
    expect(m.running).toBe(1);
    expect(m.review).toBe(1);
    expect(m.failed).toBe(1);
    expect(m.pending).toBe(1);
    expect(m.pct).toBe(33); // 2/6 = 33%
  });

  it('menghitung metrik 0% dengan aman saat task kosong/null', () => {
    expect(computeSprintMetrics(null)).toEqual({ total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0, pct: 0 });
    expect(computeSprintMetrics([])).toEqual({ total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0, pct: 0 });
  });

  it('filterTasks menyaring berdasarkan filter status dan query', () => {
    const f1 = filterTasks(sampleTasks, { filter: 'done' });
    expect(f1).toHaveLength(2);
    expect(f1[0].id).toBe(2);
    expect(f1[1].id).toBe(1);

    const f2 = filterTasks(sampleTasks, { filter: 'all', q: 'fe' });
    expect(f2).toHaveLength(2);
    expect(f2.map(t => t.id)).toEqual([6, 3]);

    const f3 = filterTasks(null);
    expect(f3).toEqual([]);
  });
});
