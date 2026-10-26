import { describe, it, expect } from 'vitest';
import {
  KANBAN_COLUMNS,
  ROLE_COLORS,
  ROLE_LABELS,
  getTaskRoleBadgeColor,
  getTaskRoleLabel,
  getKanbanColumnKey,
  matchTaskDivision,
  extractTaskDivisions,
  groupTasksByKanbanColumn,
  computeSprintMetrics,
  filterTasks,
  getTaskCardBadges,
  KANBAN_EMPTY_STATES,
  getKanbanColumnEmptyState,
  computeColumnDistribution,
  getTaskAgentFocusInfo,
  PRIORITY_CONFIG,
  getTaskPriorityInfo,
  computePriorityBreakdown,
  SORT_OPTIONS,
  extractTaskSortValue,
  sortTasks,
  canMoveTaskToColumn,
  getAvailableColumnMoves,
  moveTaskToColumn,
  normalizeTag,
  formatTagLabel,
  TAG_PALETTE,
  getTagColor,
  extractTaskTags,
  computeTagCloud,
  matchTaskTags,
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

describe('kanban_spec — normalisasi huruf besar/kecil & spasi', () => {
  it('getTaskRoleBadgeColor toleran terhadap huruf besar & spasi', () => {
    expect(getTaskRoleBadgeColor('BE')).toBe(ROLE_COLORS.be);
    expect(getTaskRoleBadgeColor(' Fe ')).toBe(ROLE_COLORS.fe);
    expect(getTaskRoleBadgeColor('Ops')).toBe(ROLE_COLORS.ops);
    expect(getTaskRoleBadgeColor(' SEC ')).toBe(ROLE_COLORS.sec);
  });

  it('getKanbanColumnKey toleran terhadap huruf besar & spasi', () => {
    expect(getKanbanColumnKey(' IN_PROGRESS ')).toBe('running');
    expect(getKanbanColumnKey('Done')).toBe('done');
    expect(getKanbanColumnKey('QA')).toBe('review');
    expect(getKanbanColumnKey('Pending')).toBe('pending');
    expect(getKanbanColumnKey(' ERROR ')).toBe('review');
  });
});

describe('kanban_spec — ROLE_LABELS & getTaskRoleLabel', () => {
  it('memberikan label teks human-readable untuk setiap role teknis', () => {
    expect(ROLE_LABELS.be).toBe('Backend');
    expect(ROLE_LABELS.fe).toBe('Frontend');
    expect(ROLE_LABELS.ops).toBe('DevOps');
    expect(ROLE_LABELS.qa).toBe('QA');
    expect(ROLE_LABELS.pm).toBe('Product');
    expect(ROLE_LABELS.ai).toBe('AI Engine');

    expect(getTaskRoleLabel('be')).toBe('Backend');
    expect(getTaskRoleLabel('fe')).toBe('Frontend');
    expect(getTaskRoleLabel('unknown')).toBe('UNKNOWN');
    expect(getTaskRoleLabel('')).toBe('General');
    expect(getTaskRoleLabel(null)).toBe('General');
  });
});

describe('kanban_spec — matchTaskDivision & extractTaskDivisions', () => {
  const tasks = [
    { id: 10, title: 'Optimasi Postgres', role: 'backend', agent_id: 'be1', status: 'done' },
    { id: 11, title: 'UI Dashboard', role: 'frontend', agent_id: 'fe1', status: 'running' },
    { id: 12, title: 'CI/CD Pipeline', role: 'devops', agent_id: 'devops1', status: 'review' },
    { id: 13, title: 'E2E Testing', role: 'qa', agent_id: 'qa1', status: 'failed' },
    { id: 14, title: 'PRD Sprint 84', role: 'pm', agent_id: 'pm1', status: 'pending' },
    { id: 15, title: 'OmniRoute LLM fine-tune', role: 'ai', agent_id: 'ai-cs', status: 'done' },
  ];

  it('matchTaskDivision mencocokkan task dengan berbagai variasi identifier divisi', () => {
    expect(matchTaskDivision(tasks[0], 'all')).toBe(true);
    expect(matchTaskDivision(tasks[0], 'core-be')).toBe(true);
    expect(matchTaskDivision(tasks[0], 'Backend')).toBe(true);
    expect(matchTaskDivision(tasks[0], 'backend')).toBe(true);
    expect(matchTaskDivision(tasks[0], 'fe-design')).toBe(false);

    expect(matchTaskDivision(tasks[1], 'fe-design')).toBe(true);
    expect(matchTaskDivision(tasks[1], 'Frontend')).toBe(true);

    expect(matchTaskDivision(tasks[2], 'ops-sec')).toBe(true);
    expect(matchTaskDivision(tasks[3], 'qa-gov')).toBe(true);
    expect(matchTaskDivision(tasks[4], 'prod-growth')).toBe(true);
    expect(matchTaskDivision(tasks[5], 'ai-cs')).toBe(true);

    expect(matchTaskDivision(null, 'core-be')).toBe(false);
    expect(matchTaskDivision(tasks[0], null)).toBe(true);
  });

  it('extractTaskDivisions menghasilkan opsi Semua + 6 divisi dengan statistik lengkap', () => {
    const divs = extractTaskDivisions(tasks);
    expect(divs).toHaveLength(7);
    expect(divs[0].key).toBe('all');
    expect(divs[0].count).toBe(6);
    expect(divs[0].done).toBe(2);
    expect(divs[0].running).toBe(1);

    const beDiv = divs.find(d => d.key === 'core-be');
    expect(beDiv).toBeTruthy();
    expect(beDiv.count).toBe(1);
    expect(beDiv.done).toBe(1);
    expect(beDiv.pct).toBe(100);

    const feDiv = divs.find(d => d.key === 'fe-design');
    expect(feDiv.count).toBe(1);
    expect(feDiv.running).toBe(1);
  });

  it('groupTasksByKanbanColumn menyaring task hanya untuk divisi yang dipilih', () => {
    const groupedAll = groupTasksByKanbanColumn(tasks, '', 'all');
    expect(groupedAll.done).toHaveLength(2); // id 10 & 15

    const groupedBe = groupTasksByKanbanColumn(tasks, '', 'core-be');
    expect(groupedBe.done).toHaveLength(1);
    expect(groupedBe.done[0].id).toBe(10);
    expect(groupedBe.running).toHaveLength(0);
    expect(groupedBe.review).toHaveLength(0);

    const groupedFe = groupTasksByKanbanColumn(tasks, '', 'fe-design');
    expect(groupedFe.running).toHaveLength(1);
    expect(groupedFe.running[0].id).toBe(11);
  });

  it('computeSprintMetrics menghitung metrik terisolasi per divisi', () => {
    const beMetrics = computeSprintMetrics(tasks, 'core-be');
    expect(beMetrics.total).toBe(1);
    expect(beMetrics.done).toBe(1);
    expect(beMetrics.pct).toBe(100);

    const feMetrics = computeSprintMetrics(tasks, 'fe-design');
    expect(feMetrics.total).toBe(1);
    expect(feMetrics.running).toBe(1);
    expect(feMetrics.done).toBe(0);
    expect(feMetrics.pct).toBe(0);
  });

  it('filterTasks menyaring berdasarkan division/role', () => {
    const beTasks = filterTasks(tasks, { division: 'core-be' });
    expect(beTasks).toHaveLength(1);
    expect(beTasks[0].id).toBe(10);

    const feTasks = filterTasks(tasks, { role: 'frontend' });
    expect(feTasks).toHaveLength(1);
    expect(feTasks[0].id).toBe(11);
  });
});

describe('kanban_spec — getTaskCardBadges', () => {
  it('mengekstrak metadata kartu task secara akurat (file count, QA review, role)', () => {
    const taskWithFiles = {
      id: 1,
      title: 'Auth Controller',
      role: 'be',
      files: "['auth.py', 'test_auth.py']",
      review: 'All endpoints pass tests',
    };
    const b1 = getTaskCardBadges(taskWithFiles);
    expect(b1.fileCount).toBe(2);
    expect(b1.hasReview).toBe(true);
    expect(b1.roleLabel).toBe('Backend');
    expect(b1.roleColor).toBe('#3B82F6');

    const simpleTask = {
      id: 2,
      title: 'Deploy K8s',
      role: 'ops',
      files: [],
      review: '',
    };
    const b2 = getTaskCardBadges(simpleTask);
    expect(b2.fileCount).toBe(0);
    expect(b2.hasReview).toBe(false);
    expect(b2.roleLabel).toBe('DevOps');
    expect(b2.roleColor).toBe('#EC4899');
  });

  it('toleran terhadap task kosong / null / undefined', () => {
    const bNull = getTaskCardBadges(null);
    expect(bNull.fileCount).toBe(0);
    expect(bNull.hasReview).toBe(false);
    expect(bNull.roleLabel).toBe('General');
    expect(bNull.roleColor).toBe('#64748B');

    const bUndef = getTaskCardBadges(undefined);
    expect(bUndef.fileCount).toBe(0);
    expect(bUndef.hasReview).toBe(false);
  });
});

describe('kanban_spec — getKanbanColumnEmptyState', () => {
  it('mengembalikan icon dan teks kontekstual per kolom kanban', () => {
    expect(getKanbanColumnEmptyState('pending')).toEqual(KANBAN_EMPTY_STATES.pending);
    expect(getKanbanColumnEmptyState('running')).toEqual(KANBAN_EMPTY_STATES.running);
    expect(getKanbanColumnEmptyState('review')).toEqual(KANBAN_EMPTY_STATES.review);
    expect(getKanbanColumnEmptyState('done')).toEqual(KANBAN_EMPTY_STATES.done);
  });

  it('toleran terhadap huruf besar, spasi, dan nilai kosong/null', () => {
    expect(getKanbanColumnEmptyState(' PENDING ')).toEqual(KANBAN_EMPTY_STATES.pending);
    expect(getKanbanColumnEmptyState('RUNNING')).toEqual(KANBAN_EMPTY_STATES.running);
    expect(getKanbanColumnEmptyState('unknown')).toEqual({ icon: '📋', text: 'Tidak ada task' });
    expect(getKanbanColumnEmptyState('')).toEqual({ icon: '📋', text: 'Tidak ada task' });
    expect(getKanbanColumnEmptyState(null)).toEqual({ icon: '📋', text: 'Tidak ada task' });
  });
});

describe('kanban_spec — computeColumnDistribution', () => {
  it('menghitung persentase dan lebar distribusi kolom secara akurat', () => {
    const d1 = computeColumnDistribution(2, 6);
    expect(d1.count).toBe(2);
    expect(d1.total).toBe(6);
    expect(d1.pct).toBe(33);
    expect(d1.widthPct).toBe(33);
    expect(d1.ratio).toBe('2/6');

    const d2 = computeColumnDistribution(5, 5);
    expect(d2.pct).toBe(100);
    expect(d2.widthPct).toBe(100);
    expect(d2.ratio).toBe('5/5');
  });

  it('menghadapi total 0 atau negatif tanpa division by zero / NaN', () => {
    expect(computeColumnDistribution(3, 0)).toEqual({ count: 0, total: 0, pct: 0, widthPct: 0, ratio: '0/0' });
    expect(computeColumnDistribution(0, 0)).toEqual({ count: 0, total: 0, pct: 0, widthPct: 0, ratio: '0/0' });
    expect(computeColumnDistribution(-1, -5)).toEqual({ count: 0, total: 0, pct: 0, widthPct: 0, ratio: '0/0' });
  });
});

describe('kanban_spec — getTaskAgentFocusInfo', () => {
  it('menghubungkan agen task ke tim dan lantai kampus yang tepat', () => {
    const infoBe = getTaskAgentFocusInfo({ id: 10, agent_id: 'be1', role: 'be' });
    expect(infoBe.agentId).toBe('be1');
    expect(infoBe.agentName).toBe('BE1');
    expect(infoBe.teamKey).toBe('core-be');
    expect(infoBe.floor).toBe(2);

    const infoQa = getTaskAgentFocusInfo({ id: 20, agent_id: 'qa1', role: 'qa' });
    expect(infoQa.agentId).toBe('qa1');
    expect(infoQa.teamKey).toBe('qa-gov');
    expect(infoQa.floor).toBe(3);
  });

  it('toleran terhadap task null, undefined, atau tanpa agen', () => {
    expect(getTaskAgentFocusInfo(null)).toEqual({ agentId: '', agentName: '', teamKey: null, teamName: null, floor: null });
    expect(getTaskAgentFocusInfo({})).toEqual({ agentId: '', agentName: '', teamKey: null, teamName: null, floor: null });
  });
});

describe('kanban_spec — PRIORITY_CONFIG & getTaskPriorityInfo', () => {
  it('mendefinisikan prioritas task baku secara konsisten', () => {
    expect(PRIORITY_CONFIG.urgent.label).toBe('Urgent');
    expect(PRIORITY_CONFIG.urgent.order).toBe(1);
    expect(PRIORITY_CONFIG.urgent.color).toBe('#EF4444');

    expect(PRIORITY_CONFIG.high.label).toBe('Tinggi');
    expect(PRIORITY_CONFIG.high.order).toBe(2);

    expect(PRIORITY_CONFIG.medium.label).toBe('Sedang');
    expect(PRIORITY_CONFIG.medium.order).toBe(3);

    expect(PRIORITY_CONFIG.low.label).toBe('Rendah');
    expect(PRIORITY_CONFIG.low.order).toBe(4);
  });

  it('getTaskPriorityInfo memetakan nilai prioritas dan toleran terhadap variasi case/null', () => {
    expect(getTaskPriorityInfo('urgent').key).toBe('urgent');
    expect(getTaskPriorityInfo(' URGENT ').key).toBe('urgent');
    expect(getTaskPriorityInfo('high').key).toBe('high');
    expect(getTaskPriorityInfo('medium').key).toBe('medium');
    expect(getTaskPriorityInfo('low').key).toBe('low');

    const fallback = getTaskPriorityInfo(null);
    expect(fallback.key).toBe('normal');
    expect(fallback.label).toBe('Normal');

    expect(getTaskPriorityInfo('unknown_prio').key).toBe('normal');
  });
});

describe('kanban_spec — extractTaskSortValue & sortTasks', () => {
  const sampleTasks = [
    { id: 10, title: 'Zebra Service', priority: 'low', agent_id: 'fe1', created_at: 100 },
    { id: 20, title: 'Alpha Cache', priority: 'urgent', agent_id: 'be1', created_at: 300 },
    { id: 30, title: 'Beta DB', priority: 'high', agent_id: 'ops1', created_at: 200 },
    { id: 40, title: 'Gamma API', priority: 'medium', agent_id: 'be2', created_at: 150 },
  ];

  it('extractTaskSortValue mengekstrak timestamp atau numeric ID secara cerdas', () => {
    expect(extractTaskSortValue({ id: 99, created_at: 1700 })).toBe(1700);
    expect(extractTaskSortValue({ id: 55 })).toBe(55);
    expect(extractTaskSortValue({ id: 'task-123' })).toBe(123);
    expect(extractTaskSortValue({ id: 'custom-task' })).toBe('custom-task');
    expect(extractTaskSortValue(null)).toBe(0);
  });

  it('sortTasks mengurutkan berdasarkan terbaru (newest) & terlama (oldest)', () => {
    const newest = sortTasks(sampleTasks, 'newest');
    expect(newest.map(t => t.id)).toEqual([20, 30, 40, 10]); // created_at 300, 200, 150, 100

    const oldest = sortTasks(sampleTasks, 'oldest');
    expect(oldest.map(t => t.id)).toEqual([10, 40, 30, 20]); // created_at 100, 150, 200, 300
  });

  it('sortTasks mengurutkan berdasarkan tingkat prioritas (urgent -> high -> medium -> low)', () => {
    const byPrio = sortTasks(sampleTasks, 'priority');
    expect(byPrio.map(t => t.id)).toEqual([20, 30, 40, 10]); // urgent (20), high (30), medium (40), low (10)
  });

  it('sortTasks mengurutkan berdasarkan judul (A-Z) dan agen (A-Z)', () => {
    const byTitle = sortTasks(sampleTasks, 'title');
    expect(byTitle.map(t => t.title)).toEqual(['Alpha Cache', 'Beta DB', 'Gamma API', 'Zebra Service']);

    const byAgent = sortTasks(sampleTasks, 'agent');
    expect(byAgent.map(t => t.agent_id)).toEqual(['be1', 'be2', 'fe1', 'ops1']);
  });

  it('groupTasksByKanbanColumn dan filterTasks menerapkan sorting yang dipilih', () => {
    const grouped = groupTasksByKanbanColumn([
      { id: 1, title: 'B Task', status: 'pending', priority: 'low' },
      { id: 2, title: 'A Task', status: 'pending', priority: 'urgent' },
    ], '', 'all', 'priority');
    expect(grouped.pending[0].id).toBe(2); // urgent first

    const filtered = filterTasks([
      { id: 1, title: 'Delta', status: 'done' },
      { id: 2, title: 'Alpha', status: 'done' },
    ], { filter: 'done', sortBy: 'title' });
    expect(filtered[0].title).toBe('Alpha');
  });

  it('getTaskCardBadges menyertakan informasi prioritas', () => {
    const task = { id: 1, title: 'T', role: 'be', priority: 'urgent' };
    const badges = getTaskCardBadges(task);
    expect(badges.priority.key).toBe('urgent');
    expect(badges.priority.label).toBe('Urgent');
    expect(badges.priority.icon).toBe('🔥');
  });

  it('computePriorityBreakdown menghitung rincian task per prioritas & mendukung filter divisi', () => {
    const tasks = [
      { id: 1, priority: 'urgent', role: 'be' },
      { id: 2, priority: 'high', role: 'be' },
      { id: 3, priority: 'medium', role: 'fe' },
      { id: 4, priority: 'low', role: 'ops' },
      { id: 5, priority: 'normal', role: 'fe' },
      { id: 6, priority: undefined, role: 'fe' }, // normal fallback
    ];

    const allBreakdown = computePriorityBreakdown(tasks, 'all');
    expect(allBreakdown.urgent).toBe(1);
    expect(allBreakdown.high).toBe(1);
    expect(allBreakdown.medium).toBe(1);
    expect(allBreakdown.low).toBe(1);
    expect(allBreakdown.normal).toBe(2);
    expect(allBreakdown.total).toBe(6);

    const beBreakdown = computePriorityBreakdown(tasks, 'core-be');
    expect(beBreakdown.urgent).toBe(1);
    expect(beBreakdown.high).toBe(1);
    expect(beBreakdown.medium).toBe(0);
    expect(beBreakdown.total).toBe(2);

    expect(computePriorityBreakdown(null)).toEqual({ urgent: 0, high: 0, medium: 0, low: 0, normal: 0, total: 0 });
    expect(computePriorityBreakdown([])).toEqual({ urgent: 0, high: 0, medium: 0, low: 0, normal: 0, total: 0 });
  });
});

describe('kanban_spec — canMoveTaskToColumn, getAvailableColumnMoves, moveTaskToColumn', () => {
  const task = { id: 42, title: 'Refactor DB pool', status: 'pending', role: 'be' };

  it('canMoveTaskToColumn memvalidasi target kolom kanban', () => {
    expect(canMoveTaskToColumn(task, 'running')).toBe(true);
    expect(canMoveTaskToColumn(task, 'review')).toBe(true);
    expect(canMoveTaskToColumn(task, 'done')).toBe(true);
    // Kolom saat ini tidak dapat menjadi tujuan
    expect(canMoveTaskToColumn(task, 'pending')).toBe(false);
    // Kolom tidak valid
    expect(canMoveTaskToColumn(task, 'invalid_col')).toBe(false);
    expect(canMoveTaskToColumn(null, 'running')).toBe(false);
  });

  it('getAvailableColumnMoves mengembalikan 3 kolom tujuan selain kolom saat ini', () => {
    const movesFromPending = getAvailableColumnMoves('pending');
    expect(movesFromPending).toHaveLength(3);
    expect(movesFromPending.map(m => m.key)).toEqual(['running', 'review', 'done']);

    const movesFromRunning = getAvailableColumnMoves('running');
    expect(movesFromRunning).toHaveLength(3);
    expect(movesFromRunning.map(m => m.key)).toEqual(['pending', 'review', 'done']);
  });

  it('moveTaskToColumn memperbarui status task secara immutabel dengan timestamp', () => {
    const list = [
      { id: 1, title: 'A', status: 'pending' },
      { id: 2, title: 'B', status: 'running' },
    ];
    const updated = moveTaskToColumn(list, 1, 'done');
    expect(updated).not.toBe(list);
    expect(updated[0].status).toBe('done');
    expect(updated[0].updated_at).toBeTypeOf('number');
    // Task lain tidak berubah
    expect(updated[1]).toEqual(list[1]);
  });

  it('moveTaskToColumn menangani input invalid dengan aman', () => {
    const list = [{ id: 1, status: 'pending' }];
    expect(moveTaskToColumn(list, 1, 'unknown')).toEqual(list);
    expect(moveTaskToColumn(list, 999, 'done')).toEqual(list);
    expect(moveTaskToColumn(null, 1, 'done')).toEqual([]);
  });
});

describe('kanban_spec — Tag extraction, color, cloud & multi-tag filter', () => {
  it('normalizeTag membersihkan prefix # dan karakter invalid', () => {
    expect(normalizeTag('#react')).toBe('react');
    expect(normalizeTag('##API/v1!')).toBe('api/v1');
    expect(normalizeTag('  [Frontend]  ')).toBe('frontend');
    expect(normalizeTag('')).toBe('');
    expect(normalizeTag(null)).toBe('');
  });

  it('formatTagLabel memformat label tag secara profesional', () => {
    expect(formatTagLabel('ci/cd')).toBe('CI/CD');
    expect(formatTagLabel('ui/ux')).toBe('UI/UX');
    expect(formatTagLabel('api')).toBe('API');
    expect(formatTagLabel('react-native')).toBe('React-Native');
    expect(formatTagLabel('frontend')).toBe('Frontend');
    expect(formatTagLabel('')).toBe('');
  });

  it('getTagColor menghasilkan warna palet deterministik dan valid hex', () => {
    const col1 = getTagColor('react');
    const col2 = getTagColor('react');
    expect(col1).toBe(col2);
    expect(TAG_PALETTE).toContain(col1);
    expect(getTagColor(null)).toBe('#64748B');
  });

  it('extractTaskTags mengekstrak tags dari explicit tags, labels, hashtags, brackets, dan files', () => {
    const task1 = {
      id: 10,
      title: 'Bangun endpoint auth #security [Backend]',
      tags: ['oauth', 'jwt'],
      labels: 'critical, auth',
      files: ['prisma/schema.prisma', 'server.py'],
    };
    const tags1 = extractTaskTags(task1);
    expect(tags1).toContain('oauth');
    expect(tags1).toContain('jwt');
    expect(tags1).toContain('critical');
    expect(tags1).toContain('auth');
    expect(tags1).toContain('security');
    expect(tags1).toContain('backend');
    expect(tags1).toContain('prisma');
    expect(tags1).toContain('python');

    // Kosong / null aman
    expect(extractTaskTags(null)).toEqual([]);
    expect(extractTaskTags({})).toEqual([]);
  });

  it('computeTagCloud menghitung frekuensi tag dan menyortir jumlah terbanyak', () => {
    const tasks = [
      { id: 1, title: 'T1 #react #frontend', role: 'fe' },
      { id: 2, title: 'T2 #react #typescript', role: 'fe' },
      { id: 3, title: 'T3 #react #backend', role: 'be' },
      { id: 4, title: 'T4 #backend', role: 'be' },
    ];
    const cloud = computeTagCloud(tasks);
    expect(cloud[0].tag).toBe('react');
    expect(cloud[0].count).toBe(3);
    expect(cloud[0].label).toBe('React');
    expect(cloud[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);

    // Filter divisi
    const beCloud = computeTagCloud(tasks, { divisionFilter: 'core-be' });
    expect(beCloud.find(c => c.tag === 'backend')?.count).toBe(2);
    expect(beCloud.find(c => c.tag === 'frontend')).toBeUndefined();
  });

  it('matchTaskTags mencocokkan task dengan tag tunggal atau array multi-tag', () => {
    const task = { id: 1, title: 'API Gateway #gateway', tags: ['api', 'go'] };
    expect(matchTaskTags(task, 'all')).toBe(true);
    expect(matchTaskTags(task, 'api')).toBe(true);
    expect(matchTaskTags(task, 'gateway')).toBe(true);
    expect(matchTaskTags(task, 'python')).toBe(false);

    // Multi-tag mode any vs all
    expect(matchTaskTags(task, ['api', 'python'], 'any')).toBe(true);
    expect(matchTaskTags(task, ['api', 'python'], 'all')).toBe(false);
    expect(matchTaskTags(task, ['api', 'go'], 'all')).toBe(true);
  });

  it('groupTasksByKanbanColumn dan filterTasks mendukung filter tag kustom', () => {
    const tasks = [
      { id: 1, title: 'Task A #react', status: 'pending', role: 'fe' },
      { id: 2, title: 'Task B #api', status: 'running', role: 'be' },
      { id: 3, title: 'Task C #react #api', status: 'done', role: 'fe' },
    ];

    const groupedReact = groupTasksByKanbanColumn(tasks, '', 'all', 'newest', 'react');
    expect(groupedReact.pending).toHaveLength(1);
    expect(groupedReact.running).toHaveLength(0);
    expect(groupedReact.done).toHaveLength(1);

    const filteredApi = filterTasks(tasks, { tag: 'api' });
    expect(filteredApi).toHaveLength(2);
    expect(filteredApi.map(t => t.id)).toEqual([3, 2]);

    // Query pencarian juga menemukan tag
    const groupedQuery = groupTasksByKanbanColumn(tasks, 'react');
    expect(groupedQuery.pending).toHaveLength(1);
    expect(groupedQuery.done).toHaveLength(1);
  });

  it('getTaskCardBadges mengembalikan daftar tags dengan label dan warna aksen', () => {
    const task = {
      id: 99,
      title: 'Integrasi CI/CD #ci/cd',
      tags: ['github-actions'],
      files: ['.github/workflows/ci.yml'],
    };
    const badges = getTaskCardBadges(task);
    expect(Array.isArray(badges.tags)).toBe(true);
    expect(badges.tags.length).toBeGreaterThanOrEqual(2);
    const ciTag = badges.tags.find(t => t.tag === 'ci/cd');
    expect(ciTag).toBeTruthy();
    expect(ciTag.label).toBe('CI/CD');
    expect(ciTag.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
