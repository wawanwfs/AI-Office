import { describe, it, expect } from 'vitest';
import {
  DATE_RANGE_PRESETS,
  getDateRangePreset,
  parseTaskTimestamp,
  getStartOfDay,
  parseDateInputToTimestamp,
  normalizeCustomDateRange,
  formatSimpleDate,
  formatCustomDateRange,
  isTaskInDateRange,
  filterTasksByDate,
  computeDateRangeStats,
  formatTaskDate,
  formatDateRangeSummary,
} from '../lib/kanban_date.js';

describe('kanban_date.js', () => {
  // Waktu referensi tetap untuk uji deterministik: 26 Oktober 2026, 12:00:00
  const FIXED_NOW = new Date(2026, 9, 26, 12, 0, 0).getTime();
  const START_TODAY = getStartOfDay(FIXED_NOW);
  const START_YESTERDAY = START_TODAY - 86400000;
  const THREE_DAYS_AGO = START_TODAY - 3 * 86400000;
  const TEN_DAYS_AGO = START_TODAY - 10 * 86400000;
  const FORTY_DAYS_AGO = START_TODAY - 40 * 86400000;

  describe('DATE_RANGE_PRESETS & getDateRangePreset', () => {
    it('memiliki 6 preset rentang tanggal lengkap', () => {
      expect(DATE_RANGE_PRESETS.length).toBe(6);
      const keys = DATE_RANGE_PRESETS.map((p) => p.key);
      expect(keys).toEqual(['all', 'today', 'yesterday', 'week', 'month', 'custom']);
    });

    it('setiap preset memiliki label, icon, dan deskripsi', () => {
      for (const p of DATE_RANGE_PRESETS) {
        expect(p.label).toBeTruthy();
        expect(p.shortLabel).toBeTruthy();
        expect(p.icon).toBeTruthy();
        expect(p.description).toBeTruthy();
      }
    });

    it('getDateRangePreset mengembalikan preset yang cocok case-insensitive', () => {
      expect(getDateRangePreset('today')?.label).toBe('Hari Ini');
      expect(getDateRangePreset('TODAY')?.key).toBe('today');
      expect(getDateRangePreset(' week ')?.key).toBe('week');
      expect(getDateRangePreset(null)?.key).toBe('all');
      expect(getDateRangePreset('non-existent')).toBeNull();
    });
  });

  describe('parseTaskTimestamp', () => {
    it('mengembalikan null jika task tidak valid atau kosong', () => {
      expect(parseTaskTimestamp(null)).toBeNull();
      expect(parseTaskTimestamp({})).toBeNull();
      expect(parseTaskTimestamp({ created_at: '' })).toBeNull();
      expect(parseTaskTimestamp({ created_at: null })).toBeNull();
      expect(parseTaskTimestamp('bukan objek')).toBeNull();
    });

    it('mengonversi epoch detik (UNIX) ke milidetik', () => {
      const sec = 1729900000;
      expect(parseTaskTimestamp({ created_at: sec })).toBe(sec * 1000);
      expect(parseTaskTimestamp({ created_at: String(sec) })).toBe(sec * 1000);
    });

    it('mempertahankan epoch milidetik', () => {
      const ms = 1729900000000;
      expect(parseTaskTimestamp({ created_at: ms })).toBe(ms);
      expect(parseTaskTimestamp({ created_at: String(ms) })).toBe(ms);
    });

    it('mem-parsing ISO 8601 string tanggal', () => {
      const iso = '2026-10-26T08:30:00.000Z';
      const expected = Date.parse(iso);
      expect(parseTaskTimestamp({ created_at: iso })).toBe(expected);
    });

    it('mendukung Date instance', () => {
      const d = new Date(2026, 9, 26, 10, 0, 0);
      expect(parseTaskTimestamp({ created_at: d })).toBe(d.getTime());
    });

    it('memeriksa properti fallback createdAt, timestamp, updated_at, date', () => {
      expect(parseTaskTimestamp({ createdAt: 1729900000000 })).toBe(1729900000000);
      expect(parseTaskTimestamp({ timestamp: 1729900000000 })).toBe(1729900000000);
      expect(parseTaskTimestamp({ updated_at: 1729900000000 })).toBe(1729900000000);
      expect(parseTaskTimestamp({ date: 1729900000000 })).toBe(1729900000000);
    });

    it('mengembalikan null jika string tidak dapat diparsing', () => {
      expect(parseTaskTimestamp({ created_at: 'bukan tanggal acak' })).toBeNull();
    });
  });

  describe('isTaskInDateRange & filterTasksByDate', () => {
    const taskToday = { id: 1, title: 'Task hari ini', created_at: FIXED_NOW };
    const taskYesterday = { id: 2, title: 'Task kemarin', created_at: START_YESTERDAY + 3600000 };
    const taskThreeDays = { id: 3, title: 'Task 3 hari lalu', created_at: THREE_DAYS_AGO + 3600000 };
    const taskTenDays = { id: 4, title: 'Task 10 hari lalu', created_at: TEN_DAYS_AGO + 3600000 };
    const taskFortyDays = { id: 5, title: 'Task 40 hari lalu', created_at: FORTY_DAYS_AGO + 3600000 };
    const taskUndated = { id: 6, title: 'Task tanpa tanggal' };

    const allTasks = [taskToday, taskYesterday, taskThreeDays, taskTenDays, taskFortyDays, taskUndated];

    it('preset "all" meloloskan semua task termasuk yang tanpa tanggal', () => {
      for (const t of allTasks) {
        expect(isTaskInDateRange(t, 'all', { now: FIXED_NOW })).toBe(true);
      }
      expect(filterTasksByDate(allTasks, 'all', { now: FIXED_NOW }).length).toBe(6);
    });

    it('preset "today" hanya meloloskan task hari ini', () => {
      expect(isTaskInDateRange(taskToday, 'today', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskYesterday, 'today', { now: FIXED_NOW })).toBe(false);
      expect(isTaskInDateRange(taskThreeDays, 'today', { now: FIXED_NOW })).toBe(false);
      expect(isTaskInDateRange(taskUndated, 'today', { now: FIXED_NOW })).toBe(false);

      const res = filterTasksByDate(allTasks, 'today', { now: FIXED_NOW });
      expect(res.map((t) => t.id)).toEqual([1]);
    });

    it('preset "yesterday" hanya meloloskan task kemarin', () => {
      expect(isTaskInDateRange(taskToday, 'yesterday', { now: FIXED_NOW })).toBe(false);
      expect(isTaskInDateRange(taskYesterday, 'yesterday', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskThreeDays, 'yesterday', { now: FIXED_NOW })).toBe(false);

      const res = filterTasksByDate(allTasks, 'yesterday', { now: FIXED_NOW });
      expect(res.map((t) => t.id)).toEqual([2]);
    });

    it('preset "week" meloloskan task dalam 7 hari terakhir', () => {
      expect(isTaskInDateRange(taskToday, 'week', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskYesterday, 'week', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskThreeDays, 'week', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskTenDays, 'week', { now: FIXED_NOW })).toBe(false);

      const res = filterTasksByDate(allTasks, 'week', { now: FIXED_NOW });
      expect(res.map((t) => t.id)).toEqual([1, 2, 3]);
    });

    it('preset "month" meloloskan task dalam 30 hari terakhir', () => {
      expect(isTaskInDateRange(taskToday, 'month', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskTenDays, 'month', { now: FIXED_NOW })).toBe(true);
      expect(isTaskInDateRange(taskFortyDays, 'month', { now: FIXED_NOW })).toBe(false);

      const res = filterTasksByDate(allTasks, 'month', { now: FIXED_NOW });
      expect(res.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    });

    it('mendukung opsi includeUndated', () => {
      expect(isTaskInDateRange(taskUndated, 'today', { now: FIXED_NOW, includeUndated: true })).toBe(true);
    });

    it('preset "today"/"week"/"month" menutup tepat di akhir hari (tanpa bocor ke besok)', () => {
      const END_TODAY = START_TODAY + 86400000 - 1; // 23:59:59.999 hari ini
      const START_TOMORROW = START_TODAY + 86400000; // 00:00:00.000 besok
      const taskEndToday = { id: 7, title: 'Task akhir hari ini', created_at: END_TODAY };
      const taskTomorrowStart = { id: 8, title: 'Task tepat besok', created_at: START_TOMORROW };

      for (const key of ['today', 'week', 'month']) {
        expect(isTaskInDateRange(taskEndToday, key, { now: FIXED_NOW })).toBe(true);
        expect(isTaskInDateRange(taskTomorrowStart, key, { now: FIXED_NOW })).toBe(false);
      }

      expect(filterTasksByDate([taskEndToday, taskTomorrowStart], 'today', { now: FIXED_NOW }).map((t) => t.id)).toEqual([7]);
    });
  });

  describe('computeDateRangeStats', () => {
    it('menghitung metrik distribusi task per rentang tanggal dengan akurat', () => {
      const sample = [
        { id: 1, created_at: FIXED_NOW },
        { id: 2, created_at: START_YESTERDAY + 1000 },
        { id: 3, created_at: THREE_DAYS_AGO },
        { id: 4, created_at: TEN_DAYS_AGO },
        { id: 5, created_at: FORTY_DAYS_AGO },
        { id: 6, title: 'No timestamp' },
      ];

      const stats = computeDateRangeStats(sample, { now: FIXED_NOW });
      expect(stats.all).toBe(6);
      expect(stats.today).toBe(1);
      expect(stats.yesterday).toBe(1);
      expect(stats.week).toBe(3); // today (1) + yesterday (1) + 3 days (1)
      expect(stats.month).toBe(4); // week (3) + 10 days (1)
      expect(stats.undated).toBe(1);
    });

    it('menangani input array kosong dan non-array dengan aman', () => {
      const empty = computeDateRangeStats([]);
      expect(empty.all).toBe(0);
      expect(empty.today).toBe(0);
      expect(computeDateRangeStats(null).all).toBe(0);
    });
  });

  describe('formatTaskDate', () => {
    it('mengembalikan "—" jika task tidak memiliki tanggal', () => {
      expect(formatTaskDate(null)).toBe('—');
      expect(formatTaskDate({})).toBe('—');
    });

    it('memformat "Hari ini, HH:MM" untuk task hari ini', () => {
      const t = { created_at: new Date(2026, 9, 26, 14, 25).getTime() };
      const str = formatTaskDate(t, { now: FIXED_NOW });
      expect(str).toBe('Hari ini, 14:25');
    });

    it('memformat "Kemarin, HH:MM" untuk task kemarin', () => {
      const t = { created_at: new Date(2026, 9, 25, 9, 10).getTime() };
      const str = formatTaskDate(t, { now: FIXED_NOW });
      expect(str).toBe('Kemarin, 09:10');
    });

    it('memformat tanggal lengkap untuk task lebih lama', () => {
      const t = { created_at: new Date(2026, 9, 15, 11, 0).getTime() };
      const str = formatTaskDate(t, { now: FIXED_NOW });
      expect(str).toBe('15 Okt, 11:00');
    });
  });

  describe('formatDateRangeSummary', () => {
    it('menghasilkan ringkasan deskriptif', () => {
      expect(formatDateRangeSummary('all', 12)).toBe('Semua Waktu (12 task)');
      expect(formatDateRangeSummary('today', 3)).toBe('Rentang: Hari Ini (3 task)');
      expect(formatDateRangeSummary('week')).toBe('Rentang: 7 Hari Terakhir');
      expect(formatDateRangeSummary('custom', 5, { customRange: { start: '2026-10-20', end: '2026-10-25' } })).toBe('Rentang: 20 – 25 Okt 2026 (5 task)');
    });
  });

  describe('Fitur Rentang Tanggal Kustom (Custom Date Range)', () => {
    describe('parseDateInputToTimestamp', () => {
      it('mengonversi YYYY-MM-DD ke awal hari dan akhir hari', () => {
        const start = parseDateInputToTimestamp('2026-10-26', false);
        const end = parseDateInputToTimestamp('2026-10-26', true);
        expect(start).not.toBeNull();
        expect(end).not.toBeNull();
        expect(end - start).toBe(86399999); // 23:59:59.999 - 00:00:00.000

        const dStart = new Date(start);
        expect(dStart.getFullYear()).toBe(2026);
        expect(dStart.getMonth()).toBe(9); // Oktober
        expect(dStart.getDate()).toBe(26);
        expect(dStart.getHours()).toBe(0);

        const dEnd = new Date(end);
        expect(dEnd.getHours()).toBe(23);
        expect(dEnd.getMinutes()).toBe(59);
      });

      it('menangani timestamp numerik, Date object, dan string kosong', () => {
        expect(parseDateInputToTimestamp(null)).toBeNull();
        expect(parseDateInputToTimestamp('')).toBeNull();
        expect(parseDateInputToTimestamp('bukan-tanggal')).toBeNull();

        const now = Date.now();
        expect(parseDateInputToTimestamp(now, false)).toBe(getStartOfDay(now));
        const dateObj = new Date(2026, 9, 20, 15, 0);
        expect(parseDateInputToTimestamp(dateObj, false)).toBe(new Date(2026, 9, 20, 0, 0, 0, 0).getTime());
      });
    });

    describe('normalizeCustomDateRange', () => {
      it('menormalkan objek rentang tanggal kustom yang valid', () => {
        const norm = normalizeCustomDateRange({ start: '2026-10-20', end: '2026-10-26' });
        expect(norm.isValid).toBe(true);
        expect(norm.isEmpty).toBe(false);
        expect(norm.isReversed).toBe(false);
        expect(norm.startTs).toBeLessThan(norm.endTs);
      });

      it('mendeteksi jika tanggal awal lebih besar dari tanggal akhir (reversed)', () => {
        const norm = normalizeCustomDateRange({ start: '2026-10-28', end: '2026-10-20' });
        expect(norm.isValid).toBe(false);
        expect(norm.isReversed).toBe(true);
      });

      it('menangani rentang hanya start atau hanya end', () => {
        const onlyStart = normalizeCustomDateRange({ start: '2026-10-20' });
        expect(onlyStart.isValid).toBe(true);
        expect(onlyStart.startTs).not.toBeNull();
        expect(onlyStart.endTs).toBeNull();

        const onlyEnd = normalizeCustomDateRange({ end: '2026-10-26' });
        expect(onlyEnd.isValid).toBe(true);
        expect(onlyEnd.startTs).toBeNull();
        expect(onlyEnd.endTs).not.toBeNull();
      });

      it('menangani input null/kosong', () => {
        const empty = normalizeCustomDateRange(null);
        expect(empty.isEmpty).toBe(true);
        expect(empty.isValid).toBe(true);
      });
    });

    describe('formatCustomDateRange & formatSimpleDate', () => {
      it('memformat rentang tanggal dalam bulan yang sama', () => {
        const str = formatCustomDateRange({ start: '2026-10-20', end: '2026-10-25' });
        expect(str).toBe('20 – 25 Okt 2026');
        expect(formatSimpleDate(new Date(2026, 9, 20).getTime())).toBe('20 Okt 2026');
        expect(formatSimpleDate(null)).toBe('');
      });

      it('memformat tanggal tunggal jika start dan end sama', () => {
        const str = formatCustomDateRange({ start: '2026-10-26', end: '2026-10-26' });
        expect(str).toBe('26 Okt 2026');
      });

      it('memformat jika hanya start atau hanya end', () => {
        expect(formatCustomDateRange({ start: '2026-10-20' })).toBe('Dari 20 Okt 2026');
        expect(formatCustomDateRange({ end: '2026-10-26' })).toBe('Hingga 26 Okt 2026');
      });

      it('menangani rentang kosong dan invalid', () => {
        expect(formatCustomDateRange(null)).toBe('Semua Tanggal');
        expect(formatCustomDateRange({ start: '2026-10-28', end: '2026-10-20' })).toBe('Rentang Tidak Valid (Awal > Akhir)');
      });
    });

    describe('isTaskInDateRange & filterTasksByDate dengan custom range', () => {
      const taskA = { id: 1, title: 'Task 20 Okt', created_at: new Date(2026, 9, 20, 10, 0).getTime() };
      const taskB = { id: 2, title: 'Task 23 Okt', created_at: new Date(2026, 9, 23, 14, 0).getTime() };
      const taskC = { id: 3, title: 'Task 26 Okt', created_at: new Date(2026, 9, 26, 16, 0).getTime() };
      const taskUndated = { id: 4, title: 'Task No Date' };
      const taskList = [taskA, taskB, taskC, taskUndated];

      it('menyaring task dalam rentang start dan end', () => {
        const filtered = filterTasksByDate(taskList, 'custom', {
          customRange: { start: '2026-10-21', end: '2026-10-25' },
        });
        expect(filtered.map((t) => t.id)).toEqual([2]);
      });

      it('menyaring task dengan hanya start (terbuka ke atas)', () => {
        const filtered = filterTasksByDate(taskList, 'custom', {
          customRange: { start: '2026-10-22' },
        });
        expect(filtered.map((t) => t.id)).toEqual([2, 3]);
      });

      it('menyaring task dengan hanya end (terbuka ke bawah)', () => {
        const filtered = filterTasksByDate(taskList, 'custom', {
          customRange: { end: '2026-10-22' },
        });
        expect(filtered.map((t) => t.id)).toEqual([1]);
      });

      it('menolak task jika rentang reversed (awal > akhir)', () => {
        const filtered = filterTasksByDate(taskList, 'custom', {
          customRange: { start: '2026-10-28', end: '2026-10-20' },
        });
        expect(filtered).toEqual([]);
      });

      it('meloloskan semua jika custom range kosong', () => {
        const filtered = filterTasksByDate(taskList, 'custom', {
          customRange: {},
        });
        expect(filtered.length).toBe(3);

        const withUndated = filterTasksByDate(taskList, 'custom', {
          customRange: {},
          includeUndated: true,
        });
        expect(withUndated.length).toBe(4);
      });
    });

    describe('computeDateRangeStats dengan custom range', () => {
      it('menghitung stats.custom berdasarkan customRange yang diberikan', () => {
        const taskA = { id: 1, created_at: new Date(2026, 9, 20, 10, 0).getTime() };
        const taskB = { id: 2, created_at: new Date(2026, 9, 23, 14, 0).getTime() };
        const taskC = { id: 3, created_at: new Date(2026, 9, 26, 16, 0).getTime() };
        const tasks = [taskA, taskB, taskC];

        const stats = computeDateRangeStats(tasks, {
          customRange: { start: '2026-10-22', end: '2026-10-27' },
        });
        expect(stats.custom).toBe(2); // taskB dan taskC
      });
    });
  });
});
