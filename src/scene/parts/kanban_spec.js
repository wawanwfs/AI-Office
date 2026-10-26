// Spesifikasi murni tata letak & pengelompokan Kanban Sprint (tanpa Three/DOM).
// Digunakan oleh TaskBoard, AgentInspector, dan OfficeScene whiteboard interaksi.

import { TEAMS, findTeamByRole, findTeamByAgent, computeTeamStats } from './team_spec.js';
import { parseFileList } from '../../lib/files.js';

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

export const PRIORITY_CONFIG = {
  urgent: { key: 'urgent', label: 'Urgent', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.16)', icon: '🔥', order: 1 },
  high: { key: 'high', label: 'Tinggi', color: '#F97316', bg: 'rgba(249, 115, 22, 0.16)', icon: '🔺', order: 2 },
  medium: { key: 'medium', label: 'Sedang', color: '#EAB308', bg: 'rgba(234, 179, 8, 0.16)', icon: '▫️', order: 3 },
  low: { key: 'low', label: 'Rendah', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.14)', icon: '🔽', order: 4 },
};

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Terbaru', icon: '🕒' },
  { key: 'oldest', label: 'Terlama', icon: '⏳' },
  { key: 'priority', label: 'Prioritas', icon: '🔥' },
  { key: 'title', label: 'Judul (A-Z)', icon: '🔤' },
  { key: 'agent', label: 'Agen (A-Z)', icon: '👤' },
];

export function getTaskPriorityInfo(priority) {
  const p = String(priority || '').toLowerCase().trim();
  return PRIORITY_CONFIG[p] || { key: 'normal', label: 'Normal', color: '#64748B', bg: 'rgba(100, 116, 139, 0.12)', icon: '•', order: 5 };
}

/**
 * Menghitung rincian jumlah task per level prioritas (urgent, high, medium, low, normal).
 * Mendukung filter divisi opsional.
 */
export function computePriorityBreakdown(tasks, divisionFilter = 'all') {
  const counts = { urgent: 0, high: 0, medium: 0, low: 0, normal: 0, total: 0 };
  if (!Array.isArray(tasks) || !tasks.length) return counts;
  const df = String(divisionFilter || 'all').toLowerCase().trim();
  const filtered = df === 'all' ? tasks : tasks.filter((t) => matchTaskDivision(t, df));
  counts.total = filtered.length;
  filtered.forEach((t) => {
    if (!t) return;
    const p = String(t.priority || '').toLowerCase().trim();
    if (counts[p] !== undefined) {
      counts[p]++;
    } else {
      counts.normal++;
    }
  });
  return counts;
}

export function extractTaskSortValue(task) {
  if (!task || typeof task !== 'object') return 0;
  if (task.created_at != null && !isNaN(Number(task.created_at))) {
    return Number(task.created_at);
  }
  const idStr = String(task.id ?? '');
  const num = Number(idStr);
  if (!isNaN(num)) return num;
  const match = idStr.match(/\d+/);
  if (match) return Number(match[0]);
  return idStr;
}

export function sortTasks(tasks, sortBy = 'newest') {
  if (!Array.isArray(tasks)) return [];
  const sb = String(sortBy || 'newest').toLowerCase().trim();
  const copy = [...tasks];

  switch (sb) {
    case 'oldest':
      return copy.sort((a, b) => {
        const valA = extractTaskSortValue(a);
        const valB = extractTaskSortValue(b);
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valA - valB;
        }
        return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
      });

    case 'priority':
      return copy.sort((a, b) => {
        const prioA = getTaskPriorityInfo(a?.priority).order;
        const prioB = getTaskPriorityInfo(b?.priority).order;
        if (prioA !== prioB) return prioA - prioB;
        const valA = extractTaskSortValue(a);
        const valB = extractTaskSortValue(b);
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valB - valA;
        }
        return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
      });

    case 'title':
      return copy.sort((a, b) => {
        const titleA = String(a?.title ?? '').toLowerCase();
        const titleB = String(b?.title ?? '').toLowerCase();
        return titleA.localeCompare(titleB);
      });

    case 'agent':
      return copy.sort((a, b) => {
        const agA = String(a?.agent_id ?? '').toLowerCase();
        const agB = String(b?.agent_id ?? '').toLowerCase();
        if (agA !== agB) return agA.localeCompare(agB);
        const valA = extractTaskSortValue(a);
        const valB = extractTaskSortValue(b);
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valB - valA;
        }
        return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
      });

    case 'newest':
    default:
      return copy.sort((a, b) => {
        const valA = extractTaskSortValue(a);
        const valB = extractTaskSortValue(b);
        if (typeof valA === 'number' && typeof valB === 'number') {
          return valB - valA;
        }
        return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
      });
  }
}

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

export const KANBAN_EMPTY_STATES = {
  pending: { icon: '✨', text: 'Semua antrean terambil' },
  running: { icon: '☕', text: 'Tidak ada eksekusi aktif' },
  review: { icon: '🎉', text: 'Bebas kendala & review QA' },
  done: { icon: '⏳', text: 'Belum ada task selesai' },
};

export function getKanbanColumnEmptyState(columnKey) {
  const k = String(columnKey || '').toLowerCase().trim();
  return KANBAN_EMPTY_STATES[k] || { icon: '📋', text: 'Tidak ada task' };
}

export function computeColumnDistribution(columnCount, totalCount) {
  const count = Math.max(0, Number(columnCount) || 0);
  const total = Math.max(0, Number(totalCount) || 0);
  if (total <= 0) {
    return { count: 0, total: 0, pct: 0, widthPct: 0, ratio: '0/0' };
  }
  const pct = Math.round((count / total) * 100);
  const widthPct = Math.min(100, Math.max(0, pct));
  return {
    count,
    total,
    pct,
    widthPct,
    ratio: `${count}/${total}`,
  };
}

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
 * Mengelompokkan task ke dalam 4 kolom kanban dengan filter query, divisi & pengurutan opsional.
 */
export function groupTasksByKanbanColumn(tasks, query = '', divisionFilter = 'all', sortBy = 'newest') {
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
      const matchText = [t.id, t.title, t.agent_id, t.role, t.status, t.priority].filter(Boolean).join(' ').toLowerCase();
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
    groups[k] = sortTasks(groups[k], sortBy);
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
 * Filter task untuk mode daftar dengan dukungan status, query, divisi, role, dan pengurutan.
 */
export function filterTasks(tasks, { filter = 'all', q = '', division = 'all', role = 'all', sortBy = 'newest' } = {}) {
  if (!Array.isArray(tasks)) return [];
  const qStr = String(q || '').toLowerCase().trim();
  const divStr = String(division !== 'all' ? division : role || 'all').toLowerCase().trim();
  const filtered = tasks.filter((t) => {
    if (!t) return false;
    const statusMatch = filter === 'all' || t.status === filter;
    if (!statusMatch) return false;
    if (divStr !== 'all' && !matchTaskDivision(t, divStr)) return false;
    if (!qStr) return true;
    const text = [t.id, t.title, t.agent_id, t.role, t.status, t.priority].filter(Boolean).join(' ').toLowerCase();
    return text.includes(qStr);
  });
  return sortTasks(filtered, sortBy);
}

/**
 * Ekstraksi metadata visual kartu kanban (jumlah file, indikator review QA, badge peran, badge prioritas).
 */
export function getTaskCardBadges(task) {
  if (!task || typeof task !== 'object') {
    return {
      fileCount: 0,
      hasReview: false,
      roleLabel: 'General',
      roleColor: '#64748B',
      priority: getTaskPriorityInfo(null),
    };
  }
  const fileCount = parseFileList(task.files).length;
  const hasReview = Boolean(task.review && String(task.review).trim().length > 0);
  const roleLabel = getTaskRoleLabel(task.role);
  const roleColor = getTaskRoleBadgeColor(task.role);
  const priority = getTaskPriorityInfo(task.priority);
  return {
    fileCount,
    hasReview,
    roleLabel,
    roleColor,
    priority,
  };
}

/**
 * Mendapatkan informasi fokus agen & tim dari task untuk navigasi 3D.
 */
export function getTaskAgentFocusInfo(task) {
  if (!task || typeof task !== 'object') {
    return { agentId: '', agentName: '', teamKey: null, teamName: null, floor: null };
  }
  const agentId = String(task.agent_id || '').trim();
  const teamByAg = findTeamByAgent(agentId);
  const teamByRl = findTeamByRole(task.role);
  const team = teamByAg || teamByRl;
  return {
    agentId,
    agentName: agentId.toUpperCase(),
    teamKey: team ? team.key : null,
    teamName: team ? team.name : null,
    floor: team ? team.floor : null,
  };
}
