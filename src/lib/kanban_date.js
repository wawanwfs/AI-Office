/**
 * Utilitas Murni Filter Preset Rentang Tanggal Task Kanban
 * Menyediakan definisi preset rentang waktu (hari ini, kemarin, 7 hari, 30 hari, semua),
 * parser fleksibel berbagai format timestamp/created_at,
 * evaluator rentang waktu deterministik (sadar referensi waktu 'now'),
 * penghitung metrik statistik rentang tanggal,
 * dan pemformat tanggal ramah pengguna.
 */

export const DATE_RANGE_PRESETS = [
  { key: 'all', label: 'Semua Waktu', shortLabel: 'Semua', icon: '📅', days: null, description: 'Semua task tanpa batasan rentang tanggal' },
  { key: 'today', label: 'Hari Ini', shortLabel: 'Hari Ini', icon: '☀️', days: 1, description: 'Task yang dibuat atau diperbarui hari ini' },
  { key: 'yesterday', label: 'Kemarin', shortLabel: 'Kemarin', icon: '⏮️', days: 2, description: 'Task dari hari kemarin' },
  { key: 'week', label: '7 Hari Terakhir', shortLabel: '7 Hari', icon: '🗓️', days: 7, description: 'Task dalam 7 hari terakhir' },
  { key: 'month', label: '30 Hari Terakhir', shortLabel: '30 Hari', icon: '📆', days: 30, description: 'Task dalam 30 hari terakhir' },
];

export function getDateRangePreset(key) {
  if (!key) return DATE_RANGE_PRESETS[0];
  const k = String(key).toLowerCase().trim();
  return DATE_RANGE_PRESETS.find((p) => p.key === k) || null;
}

export function parseTaskTimestamp(task) {
  if (!task || typeof task !== 'object') return null;
  const raw = task.created_at ?? task.createdAt ?? task.timestamp ?? task.updated_at ?? task.updatedAt ?? task.date;
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number') {
    if (isNaN(raw) || !isFinite(raw)) return null;
    return raw < 10000000000 ? Math.round(raw * 1000) : Math.round(raw);
  }

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    const num = Number(s);
    if (!isNaN(num) && isFinite(num)) {
      return num < 10000000000 ? Math.round(num * 1000) : Math.round(num);
    }
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) return parsed;
  }

  if (raw instanceof Date) {
    const t = raw.getTime();
    return isNaN(t) ? null : t;
  }

  return null;
}

export function getStartOfDay(timestamp) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isTaskInDateRange(task, rangeKey = 'all', options = {}) {
  if (!task || typeof task !== 'object') return false;
  const key = String(rangeKey || 'all').toLowerCase().trim();
  if (key === 'all') return true;

  const taskTime = parseTaskTimestamp(task);
  if (taskTime == null) {
    return Boolean(options.includeUndated);
  }

  const now = options.now != null ? (typeof options.now === 'number' ? options.now : new Date(options.now).getTime()) : Date.now();
  const startOfToday = getStartOfDay(now);
  const endOfToday = startOfToday + 86400000 - 1;
  const startOfYesterday = startOfToday - 86400000;

  switch (key) {
    case 'today':
      return taskTime >= startOfToday && taskTime <= endOfToday + 3600000;
    case 'yesterday':
      return taskTime >= startOfYesterday && taskTime < startOfToday;
    case 'week':
      return taskTime >= startOfToday - (6 * 86400000) && taskTime <= endOfToday + 3600000;
    case 'month':
      return taskTime >= startOfToday - (29 * 86400000) && taskTime <= endOfToday + 3600000;
    default:
      return true;
  }
}

export function filterTasksByDate(tasks, rangeKey = 'all', options = {}) {
  if (!Array.isArray(tasks)) return [];
  const key = String(rangeKey || 'all').toLowerCase().trim();
  if (key === 'all') return [...tasks];
  return tasks.filter((t) => isTaskInDateRange(t, key, options));
}

export function computeDateRangeStats(tasks, options = {}) {
  const stats = {
    all: 0,
    today: 0,
    yesterday: 0,
    week: 0,
    month: 0,
    undated: 0,
  };
  if (!Array.isArray(tasks)) return stats;

  const now = options.now != null ? (typeof options.now === 'number' ? options.now : new Date(options.now).getTime()) : Date.now();

  for (const t of tasks) {
    if (!t || typeof t !== 'object') continue;
    stats.all++;
    const ts = parseTaskTimestamp(t);
    if (ts == null) {
      stats.undated++;
      continue;
    }
    if (isTaskInDateRange(t, 'today', { now })) stats.today++;
    if (isTaskInDateRange(t, 'yesterday', { now })) stats.yesterday++;
    if (isTaskInDateRange(t, 'week', { now })) stats.week++;
    if (isTaskInDateRange(t, 'month', { now })) stats.month++;
  }

  return stats;
}

export function formatTaskDate(task, options = {}) {
  const ts = parseTaskTimestamp(task);
  if (ts == null) return '—';

  const d = new Date(ts);
  const now = options.now != null ? (typeof options.now === 'number' ? options.now : new Date(options.now).getTime()) : Date.now();
  const startOfToday = getStartOfDay(now);
  const startOfYesterday = startOfToday - 86400000;

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (ts >= startOfToday && ts < startOfToday + 86400000) {
    return `Hari ini, ${timeStr}`;
  }
  if (ts >= startOfYesterday && ts < startOfToday) {
    return `Kemarin, ${timeStr}`;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = d.getDate();
  const monthName = months[d.getMonth()] || '';
  const year = d.getFullYear();
  const nowYear = new Date(now).getFullYear();

  if (year === nowYear) {
    return `${day} ${monthName}, ${timeStr}`;
  }
  return `${day} ${monthName} ${year}, ${timeStr}`;
}

export function formatDateRangeSummary(rangeKey, count) {
  const preset = getDateRangePreset(rangeKey) || DATE_RANGE_PRESETS[0];
  if (preset.key === 'all') {
    return count != null ? `Semua Waktu (${count} task)` : 'Semua Waktu';
  }
  return count != null ? `Rentang: ${preset.label} (${count} task)` : `Rentang: ${preset.label}`;
}
