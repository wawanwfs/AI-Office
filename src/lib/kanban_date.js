/**
 * Utilitas Murni Filter Preset Rentang Tanggal Task Kanban
 * Menyediakan definisi preset rentang waktu (hari ini, kemarin, 7 hari, 30 hari, kustom, semua),
 * parser fleksibel berbagai format timestamp/created_at,
 * evaluator rentang waktu deterministik (sadar referensi waktu 'now' & rentang kustom),
 * penghitung metrik statistik rentang tanggal,
 * normalisasi & validasi rentang tanggal kustom,
 * dan pemformat tanggal ramah pengguna.
 */

export const DATE_RANGE_PRESETS = [
  { key: 'all', label: 'Semua Waktu', shortLabel: 'Semua', icon: '📅', days: null, description: 'Semua task tanpa batasan rentang tanggal' },
  { key: 'today', label: 'Hari Ini', shortLabel: 'Hari Ini', icon: '☀️', days: 1, description: 'Task yang dibuat atau diperbarui hari ini' },
  { key: 'yesterday', label: 'Kemarin', shortLabel: 'Kemarin', icon: '⏮️', days: 2, description: 'Task dari hari kemarin' },
  { key: 'week', label: '7 Hari Terakhir', shortLabel: '7 Hari', icon: '🗓️', days: 7, description: 'Task dalam 7 hari terakhir' },
  { key: 'month', label: '30 Hari Terakhir', shortLabel: '30 Hari', icon: '📆', days: 30, description: 'Task dalam 30 hari terakhir' },
  { key: 'custom', label: 'Rentang Kustom…', shortLabel: 'Kustom…', icon: '⚙️', days: null, description: 'Pilih rentang tanggal awal dan akhir secara manual' },
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

/**
 * Mengonversi input string tanggal (YYYY-MM-DD), Date, atau timestamp ke milidetik.
 * Bila isEndOfDay = true, waktu disetel ke batas akhir hari (23:59:59.999).
 */
export function parseDateInputToTimestamp(input, isEndOfDay = false) {
  if (input == null || input === '') return null;

  if (typeof input === 'number') {
    if (isNaN(input) || !isFinite(input)) return null;
    const ms = input < 10000000000 ? Math.round(input * 1000) : Math.round(input);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    if (isEndOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d.getTime();
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const d = new Date(input.getTime());
    if (isEndOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d.getTime();
  }

  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const d = new Date(y, m, day);
      if (isNaN(d.getTime())) return null;
      if (isEndOfDay) {
        d.setHours(23, 59, 59, 999);
      } else {
        d.setHours(0, 0, 0, 0);
      }
      return d.getTime();
    }
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      if (isEndOfDay) {
        d.setHours(23, 59, 59, 999);
      } else {
        d.setHours(0, 0, 0, 0);
      }
      return d.getTime();
    }
  }

  return null;
}

/**
 * Normalisasi objek rentang tanggal kustom { start, end } atau { startDate, endDate }.
 */
export function normalizeCustomDateRange(range) {
  if (!range || typeof range !== 'object') {
    return { start: null, end: null, startTs: null, endTs: null, isValid: true, isEmpty: true, isReversed: false };
  }

  const rawStart = range.start ?? range.startDate ?? (Array.isArray(range) ? range[0] : null);
  const rawEnd = range.end ?? range.endDate ?? (Array.isArray(range) ? range[1] : null);

  const startTs = parseDateInputToTimestamp(rawStart, false);
  const endTs = parseDateInputToTimestamp(rawEnd, true);

  const isEmpty = startTs == null && endTs == null;
  const isReversed = startTs != null && endTs != null && startTs > endTs;
  const isValid = !isReversed;

  return {
    start: rawStart ? String(rawStart) : null,
    end: rawEnd ? String(rawEnd) : null,
    startTs,
    endTs,
    isValid,
    isEmpty,
    isReversed,
  };
}

/**
 * Format string tanggal singkat ramah pengguna (contoh: "26 Okt 2026").
 */
export function formatSimpleDate(timestamp) {
  if (timestamp == null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format deskripsi rentang tanggal kustom (contoh: "20 Okt – 26 Okt 2026", "Dari 20 Okt 2026", "Hingga 26 Okt 2026").
 */
export function formatCustomDateRange(range) {
  const norm = normalizeCustomDateRange(range);
  if (norm.isEmpty) return 'Semua Tanggal';
  if (norm.isReversed) return 'Rentang Tidak Valid (Awal > Akhir)';

  if (norm.startTs != null && norm.endTs != null) {
    const sDate = new Date(norm.startTs);
    const eDate = new Date(norm.endTs);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    if (sDate.getFullYear() === eDate.getFullYear()) {
      if (sDate.getMonth() === eDate.getMonth()) {
        if (sDate.getDate() === eDate.getDate()) {
          return `${sDate.getDate()} ${months[sDate.getMonth()]} ${sDate.getFullYear()}`;
        }
        return `${sDate.getDate()} – ${eDate.getDate()} ${months[sDate.getMonth()]} ${sDate.getFullYear()}`;
      }
      return `${sDate.getDate()} ${months[sDate.getMonth()]} – ${eDate.getDate()} ${months[eDate.getMonth()]} ${sDate.getFullYear()}`;
    }
    return `${formatSimpleDate(norm.startTs)} – ${formatSimpleDate(norm.endTs)}`;
  }

  if (norm.startTs != null) {
    return `Dari ${formatSimpleDate(norm.startTs)}`;
  }

  return `Hingga ${formatSimpleDate(norm.endTs)}`;
}

export function isTaskInDateRange(task, rangeKey = 'all', options = {}) {
  if (!task || typeof task !== 'object') return false;
  const key = String(rangeKey || 'all').toLowerCase().trim();
  if (key === 'all') return true;

  const taskTime = parseTaskTimestamp(task);
  if (taskTime == null) {
    return Boolean(options.includeUndated);
  }

  if (key === 'custom') {
    const custom = normalizeCustomDateRange(options.customRange || options);
    if (custom.isEmpty) return true;
    if (!custom.isValid) return false;
    if (custom.startTs != null && taskTime < custom.startTs) return false;
    if (custom.endTs != null && taskTime > custom.endTs) return false;
    return true;
  }

  const now = options.now != null ? (typeof options.now === 'number' ? options.now : new Date(options.now).getTime()) : Date.now();
  const startOfToday = getStartOfDay(now);
  const endOfToday = startOfToday + 86400000 - 1;
  const startOfYesterday = startOfToday - 86400000;

  switch (key) {
    case 'today':
      return taskTime >= startOfToday && taskTime <= endOfToday;
    case 'yesterday':
      return taskTime >= startOfYesterday && taskTime < startOfToday;
    case 'week':
      return taskTime >= startOfToday - (6 * 86400000) && taskTime <= endOfToday;
    case 'month':
      return taskTime >= startOfToday - (29 * 86400000) && taskTime <= endOfToday;
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
    custom: 0,
    undated: 0,
  };
  if (!Array.isArray(tasks)) return stats;

  const now = options.now != null ? (typeof options.now === 'number' ? options.now : new Date(options.now).getTime()) : Date.now();
  const customOpts = { ...options, now };

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
    if (isTaskInDateRange(t, 'custom', customOpts)) stats.custom++;
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

export function formatDateRangeSummary(rangeKey, count, options = {}) {
  const preset = getDateRangePreset(rangeKey) || DATE_RANGE_PRESETS[0];
  if (preset.key === 'all') {
    return count != null ? `Semua Waktu (${count} task)` : 'Semua Waktu';
  }
  if (preset.key === 'custom') {
    const rangeText = formatCustomDateRange(options.customRange || options);
    return count != null ? `Rentang: ${rangeText} (${count} task)` : `Rentang: ${rangeText}`;
  }
  return count != null ? `Rentang: ${preset.label} (${count} task)` : `Rentang: ${preset.label}`;
}
