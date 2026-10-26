// Spesifikasi murni tata letak & pengelompokan Kanban Sprint (tanpa Three/DOM).
// Digunakan oleh TaskBoard dan OfficeScene whiteboard interaksi.

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

export function getTaskRoleBadgeColor(role) {
  const r = String(role || '').toLowerCase().trim();
  return ROLE_COLORS[r] || '#64748B';
}

export function getKanbanColumnKey(status) {
  const s = String(status || '').toLowerCase().trim();
  if (s === 'running' || s === 'in_progress' || s === 'active') return 'running';
  if (s === 'done' || s === 'completed' || s === 'finished') return 'done';
  if (s === 'review' || s === 'qa' || s === 'failed' || s === 'error' || s === 'issue') return 'review';
  return 'pending';
}

export function groupTasksByKanbanColumn(tasks, query = '') {
  const groups = {
    pending: [],
    running: [],
    review: [],
    done: [],
  };
  if (!Array.isArray(tasks)) return groups;

  const q = String(query || '').toLowerCase().trim();

  tasks.forEach((t) => {
    if (!t) return;
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

export function computeSprintMetrics(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return { total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0, pct: 0 };
  }
  let done = 0, running = 0, pending = 0, review = 0, failed = 0;
  tasks.forEach((t) => {
    if (!t) return;
    const st = String(t.status || '').toLowerCase();
    if (st === 'done') done++;
    else if (st === 'running') running++;
    else if (st === 'failed') failed++;
    else if (st === 'review') review++;
    else pending++;
  });
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, running, pending, review, failed, pct };
}

export function filterTasks(tasks, { filter = 'all', q = '' } = {}) {
  if (!Array.isArray(tasks)) return [];
  const qStr = String(q || '').toLowerCase().trim();
  return tasks
    .filter((t) => {
      if (!t) return false;
      const statusMatch = filter === 'all' || t.status === filter;
      if (!statusMatch) return false;
      if (!qStr) return true;
      const text = [t.id, t.title, t.agent_id, t.role].filter(Boolean).join(' ').toLowerCase();
      return text.includes(qStr);
    })
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}
