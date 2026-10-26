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

export const SPECIAL_TAG_LABELS = {
  'ci/cd': 'CI/CD',
  'ui/ux': 'UI/UX',
  api: 'API',
  qa: 'QA',
  db: 'DB',
  sql: 'SQL',
  ai: 'AI',
  seo: 'SEO',
  mvp: 'MVP',
  oss: 'OSS',
  cli: 'CLI',
  sdk: 'SDK',
};

export function normalizeTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  return tag
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\w\d\-_/]/g, '')
    .toLowerCase();
}

export function formatTagLabel(tag) {
  const norm = normalizeTag(tag);
  if (!norm) return '';
  if (SPECIAL_TAG_LABELS[norm]) return SPECIAL_TAG_LABELS[norm];
  return norm
    .split(/([-_/])/)
    .map((part) => {
      if (part === '-' || part === '_' || part === '/') return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

export const TAG_PALETTE = [
  '#06B6D4', // cyan/teal
  '#6366F1', // indigo
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#3B82F6', // blue
  '#F97316', // orange
  '#14B8A6', // teal
  '#84CC16', // lime
  '#E11D48', // rose
];

export function getTagColor(tag) {
  const norm = normalizeTag(tag);
  if (!norm) return '#64748B';
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

export function extractTaskTags(task, { includeInferred = true } = {}) {
  if (!task || typeof task !== 'object') return [];
  const tagsSet = new Set();

  const addTag = (raw) => {
    const norm = normalizeTag(raw);
    if (norm && norm.length >= 2 && norm.length <= 25) {
      tagsSet.add(norm);
    }
  };

  // 1. Explicit task.tags
  if (Array.isArray(task.tags)) {
    task.tags.forEach(addTag);
  } else if (typeof task.tags === 'string') {
    task.tags.split(/[,;\s]+/).forEach(addTag);
  }

  // 2. Explicit task.labels
  if (Array.isArray(task.labels)) {
    task.labels.forEach(addTag);
  } else if (typeof task.labels === 'string') {
    task.labels.split(/[,;\s]+/).forEach(addTag);
  }

  // 3. Hashtags in title & desc (#api, #frontend)
  const textToScan = [task.title, task.desc, task.description].filter(Boolean).join(' ');
  const hashMatches = textToScan.match(/#([\w\d\-_/]{2,25})/g);
  if (hashMatches) {
    hashMatches.forEach((m) => addTag(m.slice(1)));
  }

  // 4. Bracket tags in title, e.g. [FE], [Backend], [Bug]
  const bracketMatches = textToScan.match(/\[([\w\d\-_/]{2,20})\]/g);
  if (bracketMatches) {
    bracketMatches.forEach((m) => addTag(m.slice(1, -1)));
  }

  // 5. Inferred tags from files & tech stack (if enabled)
  if (includeInferred && task.files) {
    const fl = parseFileList(task.files);
    fl.forEach((f) => {
      const lower = String(f || '').toLowerCase();
      if (lower.includes('ci.yml') || lower.includes('.github/workflows')) addTag('ci/cd');
      else if (lower.endsWith('.prisma') || lower.includes('schema.prisma')) addTag('prisma');
      else if (lower.endsWith('.sql')) addTag('sql');
      else if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) addTag('react');
      else if (lower.endsWith('.vue')) addTag('vue');
      else if (lower.endsWith('.py')) addTag('python');
      else if (lower.endsWith('.rs')) addTag('rust');
      else if (lower.endsWith('.go')) addTag('golang');
      else if (lower.endsWith('.css') || lower.endsWith('.scss')) addTag('css');
      else if (lower.includes('docker') || lower.endsWith('dockerfile')) addTag('docker');
    });
  }

  return Array.from(tagsSet);
}

export function computeTagCloud(tasks, { divisionFilter = 'all', minCount = 1, limit = 15 } = {}) {
  if (!Array.isArray(tasks) || !tasks.length) return [];
  const df = String(divisionFilter || 'all').toLowerCase().trim();
  const filtered = df === 'all' ? tasks : tasks.filter((t) => matchTaskDivision(t, df));
  const counts = new Map();

  filtered.forEach((t) => {
    if (!t) return;
    const tags = extractTaskTags(t);
    tags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  const result = [];
  counts.forEach((count, tag) => {
    if (count >= minCount) {
      result.push({
        tag,
        label: formatTagLabel(tag),
        count,
        color: getTagColor(tag),
      });
    }
  });

  return result
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

export function matchTaskTags(task, selectedTags, mode = 'any') {
  if (!selectedTags || selectedTags === 'all') return true;
  if (!task) return false;
  const tags = extractTaskTags(task);
  if (!tags.length) return false;

  const targetTags = (Array.isArray(selectedTags) ? selectedTags : [selectedTags])
    .map(normalizeTag)
    .filter(Boolean);

  if (!targetTags.length || targetTags.includes('all')) return true;

  if (mode === 'all') {
    return targetTags.every((tt) => tags.includes(tt));
  }
  return targetTags.some((tt) => tags.includes(tt));
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
export function groupTasksByKanbanColumn(tasks, query = '', divisionFilter = 'all', sortBy = 'newest', tagFilter = 'all') {
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
    if (tagFilter && tagFilter !== 'all' && !matchTaskTags(t, tagFilter)) return;
    if (q) {
      const taskTags = extractTaskTags(t);
      const matchText = [t.id, t.title, t.agent_id, t.role, t.status, t.priority, ...taskTags].filter(Boolean).join(' ').toLowerCase();
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
 * Filter task untuk mode daftar dengan dukungan status, query, divisi, role, pengurutan, dan tag kustom.
 */
export function filterTasks(tasks, { filter = 'all', q = '', division = 'all', role = 'all', sortBy = 'newest', tag = 'all' } = {}) {
  if (!Array.isArray(tasks)) return [];
  const qStr = String(q || '').toLowerCase().trim();
  const divStr = String(division !== 'all' ? division : role || 'all').toLowerCase().trim();
  const filtered = tasks.filter((t) => {
    if (!t) return false;
    const statusMatch = filter === 'all' || t.status === filter;
    if (!statusMatch) return false;
    if (divStr !== 'all' && !matchTaskDivision(t, divStr)) return false;
    if (tag && tag !== 'all' && !matchTaskTags(t, tag)) return false;
    if (!qStr) return true;
    const taskTags = extractTaskTags(t);
    const text = [t.id, t.title, t.agent_id, t.role, t.status, t.priority, ...taskTags].filter(Boolean).join(' ').toLowerCase();
    return text.includes(qStr);
  });
  return sortTasks(filtered, sortBy);
}

/**
 * Ekstraksi metadata visual kartu kanban (jumlah file, indikator review QA, badge peran, badge prioritas, dan tag kustom).
 */
export function getTaskCardBadges(task) {
  if (!task || typeof task !== 'object') {
    return {
      fileCount: 0,
      hasReview: false,
      roleLabel: 'General',
      roleColor: '#64748B',
      priority: getTaskPriorityInfo(null),
      tags: [],
    };
  }
  const fileCount = parseFileList(task.files).length;
  const hasReview = Boolean(task.review && String(task.review).trim().length > 0);
  const roleLabel = getTaskRoleLabel(task.role);
  const roleColor = getTaskRoleBadgeColor(task.role);
  const priority = getTaskPriorityInfo(task.priority);
  const tags = extractTaskTags(task).map((tg) => ({
    tag: tg,
    label: formatTagLabel(tg),
    color: getTagColor(tg),
  }));
  return {
    fileCount,
    hasReview,
    roleLabel,
    roleColor,
    priority,
    tags,
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

/**
 * Mengecek apakah task dapat dipindahkan ke kolom kanban tujuan.
 */
export function canMoveTaskToColumn(task, targetColKey) {
  if (!task || typeof task !== 'object') return false;
  const targetKey = String(targetColKey || '').toLowerCase().trim();
  const validCols = KANBAN_COLUMNS.map((c) => c.key);
  if (!validCols.includes(targetKey)) return false;
  const currentKey = getKanbanColumnKey(task.status);
  return currentKey !== targetKey;
}

/**
 * Mendapatkan daftar kolom kanban tujuan yang valid untuk dipindahkan.
 */
export function getAvailableColumnMoves(currentColKey) {
  const cur = String(currentColKey || '').toLowerCase().trim();
  return KANBAN_COLUMNS.filter((c) => c.key !== cur);
}

/**
 * Memindahkan task secara immutabel ke kolom kanban tujuan.
 * Mengembalikan array baru dengan status task yang diperbarui.
 */
export function moveTaskToColumn(tasks, taskId, targetColKey) {
  if (!Array.isArray(tasks) || taskId == null || !targetColKey) return Array.isArray(tasks) ? tasks : [];
  const targetKey = String(targetColKey).toLowerCase().trim();
  const validCols = KANBAN_COLUMNS.map((c) => c.key);
  if (!validCols.includes(targetKey)) return tasks;

  const statusMap = {
    pending: 'pending',
    running: 'running',
    review: 'review',
    done: 'done',
  };
  const newStatus = statusMap[targetKey] || targetKey;

  return tasks.map((t) => {
    if (!t || String(t.id) !== String(taskId)) return t;
    return {
      ...t,
      status: newStatus,
      updated_at: Date.now(),
    };
  });
}
