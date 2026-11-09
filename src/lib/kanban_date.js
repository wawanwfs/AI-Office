/**
 * Utilitas Murni Filter Preset Rentang Tanggal Task Kanban
 * Menyediakan definisi preset rentang waktu (hari ini, kemarin, 7 hari, 30 hari, kustom, semua),
 * parser fleksibel berbagai format timestamp/created_at,
 * evaluator rentang waktu deterministik (sadar referensi waktu 'now' & rentang kustom),
 * penghitung metrik statistik rentang tanggal,
 * normalisasi & validasi rentang tanggal kustom,
 * dan pemformat tanggal ramah pengguna.
 */

import { clockFromDate, idDateLong, MONTH_NAMES_ID } from './format_time.js';

/** Satu sumber nama bulan singkat ID (siklus 342, dipindah ke format_time.js
 * siklus 359 agar idDateLong tidak tergantung variabel sini — re-export
 * untuk kompatibilitas pemanggil lama). */
export { MONTH_NAMES_ID } from './format_time.js';

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
  const raw = task.created_at ?? task.createdAt ?? task.timestamp ?? task.updated_at ?? task.updatedAt ?? task.date ?? task.created ?? task.updated;
  if (raw == null || raw === '') return null;
  // Siklus 270 — mendelegasikan penuh ke parser satu-sumber parseTimestampMs
  // (dulu body parser di-copy inline di sini = duplikasi logika anti-poisoning;
  // kini satu inti, perbaikan parser otomatis berlaku ke kedua API).
  return parseTimestampMs(raw);
}

export function getStartOfDay(timestamp) {
  const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Parser timestamp MURNI satu-sumber (siklus 269 — penyatuan duplikasi parser
 * yang sebelumnya di-copy inline di parseTaskTimestamp & resolveNow).
 * Menerima number (ms atau detik UNIX <1e10 auto ×1000), Date object, atau
 * string (angka numerik / ISO date). Mengembalikan milidetik finite, atau
 * NULL bila input tak dapat diparsing (null/''/NaN/±Infinity/'invalid'/Date NaN)
 * — penelepon yang butuh fallback wall-clock memakai resolveNow().
 */
export function parseTimestampMs(input) {
  if (input == null) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return input < 10000000000 ? Math.round(input * 1000) : Math.round(input);
  }
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    const num = Number(s);
    if (Number.isFinite(num)) {
      return num < 10000000000 ? Math.round(num * 1000) : Math.round(num);
    }
    const parsed = Date.parse(s);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Resolusi timestamp acuan 'now' yang aman & anti-poisoning (siklus 268).
 * Menerima number (ms atau detik UNIX), Date object, atau parseable date string.
 * Bila null/undefined, non-finite (NaN/±Infinity), atau string tidak valid,
 * secara aman fallback ke Date.now() (waktu nyata / wall-clock by design).
 */
export function resolveNow(nowInput) {
  const t = parseTimestampMs(nowInput);
  return t != null ? t : Date.now();
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
      const m = parseInt(ymdMatch[2], 10); // 1..12
      const day = parseInt(ymdMatch[3], 10);
      // Validasi ketat: bulan 1..12 dan hari dalam batas bulan itu. Tanpa ini
      // '2026-13-01' diam-diam melompat ke Jan 2027 dan '2026-02-30' ke Mar
      // (new Date rollover), sehingga rentang kustom jadi salah tapi tampak valid.
      if (m < 1 || m > 12) return null;
      const daysInMonth = new Date(y, m, 0).getDate();
      if (!Number.isInteger(day) || day < 1 || day > daysInMonth) return null;
      const d = new Date(y, m - 1, day);
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
 * Siklus 270 — ANTI-POISONING: input diparsing via parseTimestampMs
 * (detik-UNIX <1e10 auto ×1000, ISO string, Date instance). Racun
 * (null/NaN/±Inf/0/epoch-0/'invalid'/Date NaN) → '' murni — dulu
 * new Date(NaN) memberi "NaN NaN NaN" style garbage dan detik-UNIX
 * melukis tanggal 1970 palsu.
 */
export function formatSimpleDate(timestamp) {
  const ts = parseTimestampMs(timestamp);
  if (ts == null || ts <= 0) return '';
  const d = new Date(ts);
  return idDateLong(d) || '';
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
    if (sDate.getFullYear() === eDate.getFullYear()) {
      if (sDate.getMonth() === eDate.getMonth()) {
        if (sDate.getDate() === eDate.getDate()) {
          return `${idDateLong(sDate)}`;
        }
        return `${sDate.getDate()} – ${eDate.getDate()} ${MONTH_NAMES_ID[eDate.getMonth()] || ''} ${sDate.getFullYear()}`;
      }
      return `${sDate.getDate()} ${MONTH_NAMES_ID[sDate.getMonth()] || ''} ${sDate.getFullYear()} – ${idDateLong(eDate)}`;
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

  const now = resolveNow(options.now);
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

  const now = resolveNow(options.now);
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
  const now = resolveNow(options.now);
  const startOfToday = getStartOfDay(now);
  const startOfYesterday = startOfToday - 86400000;

  const timeStr = clockFromDate(d) || '—';

  if (ts >= startOfToday && ts < startOfToday + 86400000) {
    return `Hari ini, ${timeStr}`;
  }
  if (ts >= startOfYesterday && ts < startOfToday) {
    return `Kemarin, ${timeStr}`;
  }

  const long = idDateLong(d);
  if (long == null) return '—';
  const [day, monthName, year] = long.split(' ');
  const nowYear = new Date(now).getFullYear();

  if (year === String(nowYear)) {
    return `${day} ${monthName}, ${timeStr}`;
  }
  return `${long}, ${timeStr}`;
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
