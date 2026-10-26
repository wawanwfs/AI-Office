// Spesifikasi murni tata letak & pengelompokan Kanban Sprint (tanpa Three/DOM).
// Digunakan oleh TaskBoard, AgentInspector, dan OfficeScene whiteboard interaksi.

import { TEAMS, findTeamByRole, findTeamByAgent, computeTeamStats } from './team_spec.js';

export const KANBAN_COLUMNS = [
  {
    key: 'pending',
    label: 'Antri',
    color: '#9aa7b8',
    bg: 'rgba(154, 167, 184, 0.12)',
    icon: '⏳',
    desc: 'Task dalam antrean',
  },
  {
    key: 'running',
    label: 'Sedang Jalan',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    icon: '⚡',
    desc: 'Sedang aktif dikerjakan AI',
  },
  {
    key: 'review',
    label: 'Review / Isu',
    color: '#448AFF',
    bg: 'rgba(68, 138, 255, 0.12)',
    icon: '🔍',
    desc: 'Menunggu QA atau perlu perbaikan',
  },
  {
    key: 'done',
    label: 'Selesai',
    color: '#10E5A0',
    bg: 'rgba(16, 229, 160, 0.12)',
    icon: '✅',
    desc: 'Selesai dan terverifikasi',
  },
];

export const ROLE_COLORS = {
  be: '#3B82F6',
  fe: '#10B981',
  ops: '#EC4899',
  qa: '#8B5CF6',
  pm: '#F59E0B',
  ai: '#06B6D4',
  sec: '#EF4444',
  sre: '#F97316',
};

export const ROLE_LABELS = {
  be: 'Backend',
  fe: 'Frontend',
  ops: 'DevOps',
  qa: 'QA',
  pm: 'Product',
  ai: 'AI Engine',
  sec: 'Security',
  sre: 'SRE',
};

export function getTaskRoleBadgeColor(role) {
  const r = String(role || '').toLowerCase().trim();
  return ROLE_COLORS[r] || '#64748B';
}

export function getTaskRoleLabel(role) {
  const r = String(role || '').toLowerCase().trim();
  return ROLE_LABELS[r] || (r ? r.toUpperCase() : 'General');
}

export function getKanbanColumnKey(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'running' || s === 'in_progress' || s === 'active') return 'running';
  if (s === 'done' || s === 'completed' || s === 'finished') return 'done';
  if (s === 'review' || s === 'qa' || s === 'failed' || s === 'error' || s === 'issue') return 'review';
  return 'pending';
}

/**
 * Mencocokkan task dengan filter divisi / role.
 * Mendukung division key (core-be, fe-design, dll), nama pendek (Backend), maupun role (be, fe, ops).
 */
export function matchTaskDivision(task, divisionKey) {
  if (!divisionKey || divisionKey === 'all') return true;
  if (!task) return false;
  const dk = String(divisionKey).toLowerCase().trim();

  // 1. Direct role key match (misal 'be', 'fe')
  const tRole = String(task.role || '').toLowerCase().trim();
  if (tRole === dk) return true;

  // 2. Map via team_spec berdasarkan role task
  const teamByRole = findTeamByRole(task.role);
  if (teamByRole) {
    if (teamByRole.key.toLowerCase() === dk) return true;
    if (teamByRole.shortName.toLowerCase() === dk) return true;
  }

  // 3. Map via team_spec berdasarkan ID agen
  const teamByAgent = findTeamByAgent(task.agent_id);
  if (teamByAgent) {
    if (teamByAgent.key.toLowerCase() === dk) return true;
    if (teamByAgent.shortName.toLowerCase() === dk) return true;
  }

  return false;
}

/**
 * Mengambil daftar divisi filter beserta jumlah task dan status agregatnya.
 */
export function extractTaskDivisions(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const stats = computeTeamStats(list);
  const total = list.length;

  const allOption = {
    key: 'all',
    label: 'Semua',
    fullName: 'Semua Divisi',
    color: '#10E5A0',
    count: total,
    done: list.filter((t) => t && (t.status === 'done' || t.status === 'completed')).length,
    running: list.filter((t) => t && (t.status === 'running' || t.status === 'in_progress')).length,
  };

  const divisions = [allOption];
  stats.forEach((s) => {
    divisions.push({
      key: s.key,
      label: s.shortName,
      fullName: s.name,
      color: s.color,
      floor: s.floor,
      lead: s.lead,
      count: s.total,
      done: s.done,
      running: s.running,
      review: s.review,
      failed: s.failed,
      pending: s.pending,
      pct: s.pct,
    });
  });

  return divisions;
}

/**
 * Mengelompokkan task ke dalam 4 kolom kanban dengan filter query & divisi opsional.
 */
export function groupTasksByKanbanColumn(tasks, query = '', divisionFilter = 'all') {
  const groups = {
    pending: [],
    running: [],
    review: [],
    done: [],
  };
  if (!Array.isArray(tasks)) return groups;

  const q = String(query || '').toLowerCase().trim();
  const df = String(divisionFilter || 'all').toLowerCase().trim();

  tasks.forEach((t) => {
    if (!t) return;
    if (df !== 'all' && !matchTaskDivision(t, df)) return;
    if (q) {
      const matchText = [t.id, t.title, t.agent_id, t.role, t.status].filter(Boolean).join(' ').toLowerCase();
      if (!matchText.includes(q)) return;
    }
    const colKey = getKanbanColumnKey(t.status);
    if (groups[colKey]) {
      groups[colKey].push(t);
    } else {
      groups.pending.push(t);
    }
  });

  Object.keys(groups).forEach((k) => {
    groups[k].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  });

  return groups;
}

/**
 * Menghitung metrik agregat sprint (total, done, running, review, failed, pending, pct).
 * Mendukung filter divisi opsional.
 */
export function computeSprintMetrics(tasks, divisionFilter = 'all') {
  if (!Array.isArray(tasks) || !tasks.length) {
    return { total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0, pct: 0 };
  }
  const df = String(divisionFilter || 'all').toLowerCase().trim();
  const filtered = df === 'all' ? tasks : tasks.filter((t) => matchTaskDivision(t, df));
  if (!filtered.length) {
    return { total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0, pct: 0 };
  }
  let done = 0, running = 0, pending = 0, review = 0, failed = 0;
  filtered.forEach((t) => {
    if (!t) return;
    const st = String(t.status || '').toLowerCase();
    if (st === 'done' || st === 'completed') done++;
    else if (st === 'running' || st === 'in_progress') running++;
    else if (st === 'failed') failed++;
    else if (st === 'review' || st === 'qa') review++;
    else pending++;
  });
  const total = filtered.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, running, pending, review, failed, pct };
}

/**
 * Filter task untuk mode daftar dengan dukungan status, query, divisi, dan role.
 */
export function filterTasks(tasks, { filter = 'all', q = '', division = 'all', role = 'all' } = {}) {
  if (!Array.isArray(tasks)) return [];
  const qStr = String(q || '').toLowerCase().trim();
  const divStr = String(division !== 'all' ? division : role || 'all').toLowerCase().trim();
  return tasks
    .filter((t) => {
      if (!t) return false;
      const statusMatch = filter === 'all' || t.status === filter;
      if (!statusMatch) return false;
      if (divStr !== 'all' && !matchTaskDivision(t, divStr)) return false;
      if (!qStr) return true;
      const text = [t.id, t.title, t.agent_id, t.role].filter(Boolean).join(' ').toLowerCase();
      return text.includes(qStr);
    })
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}
