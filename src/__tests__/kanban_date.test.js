import { describe, it, expect } from 'vitest';
import {
  DATE_RANGE_PRESETS,
  getDateRangePreset,
  parseTaskTimestamp,
  getStartOfDay,
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
    it('memiliki 5 preset rentang tanggal lengkap', () => {
      expect(DATE_RANGE_PRESETS.length).toBe(5);
      const keys = DATE_RANGE_PRESETS.map((p) => p.key);
      expect(keys).toEqual(['all', 'today', 'yesterday', 'week', 'month']);
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
    });
  });
});
