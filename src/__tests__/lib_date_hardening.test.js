// Guard siklus 268 — Audit Date.now() di src/lib/ & Hardening Resolusi Waktu Anti-Poisoning.
//
// Konteks backlog siklus 265-267:
//  - Di scene 3D (OfficeScene/clock_canvas), Date.now() sempat bocor ke jarum jam dinding
//    (bercampur waktu sim). Audit ini memverifikasi bahwa seluruh Date.now() di src/lib/
//    (connection_spec, fetch_timeout, kanban_date, kanban_export) adalah WAKTU NYATA
//    (wall-clock) BY DESIGN: polling gateway, HTTP deadline, timestamp task database,
//    dan metadata ekspor berkas.
//  - Audit ini juga membunuh kerapuhan tersembunyi pada injeksi `options.now`:
//    1. typeof NaN/Infinity === 'number' & new Date('invalid').getTime() menghasilkan NaN,
//       sehingga perbandingan taskTime >= startOfToday gagal total.
//    2. kanban_export::buildTaskJson throws RangeError: Invalid time value saat now tidak valid.
//    3. kanban_export::generateTaskExportFilename menghasilkan 'wfs-tasks-NaN-NaN-NaN.csv'.
//    4. connection_spec::connectionBadge menghasilkan 'Sinkron NaN mnt lalu'.
//  - Seluruhnya kini diproteksi helper `resolveNow` dan guard Number.isFinite.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveNow,
  getStartOfDay,
  isTaskInDateRange,
  computeDateRangeStats,
  formatTaskDate,
} from '../lib/kanban_date.js';
import {
  buildTaskJson,
  generateTaskExportFilename,
} from '../lib/kanban_export.js';
import {
  applyPollResult,
  connectionBadge,
} from '../lib/connection_spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LIB_DIR = join(__dirname, '..', 'lib');

describe('audit Date.now() di src/lib (arsitektur wall-clock by design)', () => {
  it('src/lib bebas dari import atau konsep simulasi waktu 3D (sim_clock, timeOfDay)', () => {
    const files = readdirSync(LIB_DIR).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThanOrEqual(10);

    for (const f of files) {
      const content = readFileSync(join(LIB_DIR, f), 'utf-8');
      expect(content).not.toMatch(/from\s+['"][^'"]*sim_clock/);
      expect(content).not.toMatch(/simMinutesToClockSeconds/);
      expect(content).not.toMatch(/advanceSimClock/);
    }
  });

  it('Date.now() di src/lib hanya ada di modul yang berstatus wall-clock by design', () => {
    const files = readdirSync(LIB_DIR).filter(f => f.endsWith('.js'));
    const filesWithDateNow = files.filter(f => {
      const content = readFileSync(join(LIB_DIR, f), 'utf-8');
      return content.includes('Date.now()');
    });

    // 3 modul resmi: connection_spec (poll gateway), fetch_timeout (HTTP timeout), kanban_date (task DB)
    expect(filesWithDateNow.sort()).toEqual([
      'connection_spec.js',
      'fetch_timeout.js',
      'kanban_date.js',
    ].sort());
  });
});

describe('kanban_date — resolveNow helper anti-poisoning', () => {
  it('null dan undefined fallback ke Date.now() (rentang toleransi 2000ms)', () => {
    const nowBefore = Date.now();
    const rNull = resolveNow(null);
    const rUndef = resolveNow(undefined);
    const nowAfter = Date.now();

    expect(rNull).toBeGreaterThanOrEqual(nowBefore);
    expect(rNull).toBeLessThanOrEqual(nowAfter);
    expect(rUndef).toBeGreaterThanOrEqual(nowBefore);
    expect(rUndef).toBeLessThanOrEqual(nowAfter);
  });

  it('nilai non-finite (NaN, Infinity, -Infinity) aman fallback ke Date.now()', () => {
    const nowBefore = Date.now();
    const rNan = resolveNow(NaN);
    const rInf = resolveNow(Infinity);
    const rNegInf = resolveNow(-Infinity);
    const nowAfter = Date.now();

    expect(rNan).toBeGreaterThanOrEqual(nowBefore);
    expect(rNan).toBeLessThanOrEqual(nowAfter);
    expect(rInf).toBeGreaterThanOrEqual(nowBefore);
    expect(rInf).toBeLessThanOrEqual(nowAfter);
    expect(rNegInf).toBeGreaterThanOrEqual(nowBefore);
    expect(rNegInf).toBeLessThanOrEqual(nowAfter);
  });

  it('string kosong, spasi, atau string tidak valid aman fallback ke Date.now()', () => {
    const nowBefore = Date.now();
    expect(resolveNow('')).toBeGreaterThanOrEqual(nowBefore);
    expect(resolveNow('   ')).toBeGreaterThanOrEqual(nowBefore);
    expect(resolveNow('bukan-tanggal-valid')).toBeGreaterThanOrEqual(nowBefore);
    expect(resolveNow('invalid date text')).toBeGreaterThanOrEqual(nowBefore);
  });

  it('Date object tidak valid (new Date(NaN)) aman fallback ke Date.now()', () => {
    const nowBefore = Date.now();
    expect(resolveNow(new Date(NaN))).toBeGreaterThanOrEqual(nowBefore);
  });

  it('timestamp ms valid (angka) dipertahankan eksak', () => {
    const ts = 1762335600000;
    expect(resolveNow(ts)).toBe(ts);
  });

  it('timestamp detik UNIX (< 1e10) otomatis dikonversi ke ms', () => {
    const sec = 1762335600;
    expect(resolveNow(sec)).toBe(sec * 1000);
  });

  it('string angka numerik diparsing dengan benar (detik maupun ms)', () => {
    expect(resolveNow('1762335600')).toBe(1762335600000);
    expect(resolveNow('1762335600000')).toBe(1762335600000);
  });

  it('Date object valid diekstrak getTime()-nya', () => {
    const d = new Date('2026-11-05T10:00:00Z');
    expect(resolveNow(d)).toBe(d.getTime());
  });

  it('ISO date string diparsing ke timestamp ms yang benar', () => {
    const iso = '2026-11-05T10:00:00Z';
    expect(resolveNow(iso)).toBe(Date.parse(iso));
  });
});

describe('kanban_date — getStartOfDay anti-poisoning', () => {
  it('NaN atau non-finite input tidak menghasilkan NaN, aman fallback ke start of today', () => {
    const startToday = getStartOfDay(Date.now());
    expect(getStartOfDay(NaN)).toBe(startToday);
    expect(getStartOfDay(Infinity)).toBe(startToday);
    expect(getStartOfDay(null)).toBe(startToday);
  });
});

describe('kanban_date — evaluasi task dengan input options.now bermasalah', () => {
  const taskToday = { id: 1, created_at: Date.now() };

  it('isTaskInDateRange aman bila options.now adalah NaN atau string invalid', () => {
    expect(isTaskInDateRange(taskToday, 'today', { now: NaN })).toBe(true);
    expect(isTaskInDateRange(taskToday, 'today', { now: 'invalid' })).toBe(true);
  });

  it('computeDateRangeStats tidak menghasilkan NaN atau 0 palsu saat now bernilai NaN', () => {
    const stats = computeDateRangeStats([taskToday], { now: NaN });
    expect(stats.all).toBe(1);
    expect(stats.today).toBe(1);
    expect(Number.isFinite(stats.today)).toBe(true);
  });

  it('formatTaskDate tidak crash dan tidak menghasilkan NaN saat now bernilai NaN/invalid', () => {
    const strNan = formatTaskDate(taskToday, { now: NaN });
    expect(strNan).toContain('Hari ini');
    expect(strNan).not.toContain('NaN');

    const strInvalid = formatTaskDate(taskToday, { now: 'invalid-date' });
    expect(strInvalid).toContain('Hari ini');
    expect(strInvalid).not.toContain('NaN');
  });
});

describe('kanban_export — ketahanan terhadap input options.now bermasalah', () => {
  const tasks = [{ id: 1, title: 'Test Task', status: 'done', priority: 'normal', role: 'be' }];

  it('buildTaskJson tidak melempar RangeError: Invalid time value saat now invalid', () => {
    expect(() => buildTaskJson(tasks, { now: 'invalid-string' })).not.toThrow();
    const res = buildTaskJson(tasks, { now: 'invalid-string' });
    expect(res.meta.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('buildTaskJson aman saat now bernilai NaN', () => {
    const res = buildTaskJson(tasks, { now: NaN });
    expect(res.meta.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('generateTaskExportFilename tidak menghasilkan wfs-tasks-NaN-NaN-NaN saat now invalid', () => {
    const fnInvalid = generateTaskExportFilename('csv', { now: 'invalid-string' });
    expect(fnInvalid).not.toContain('NaN');
    expect(fnInvalid).toMatch(/^wfs-tasks_\d{4}-\d{2}-\d{2}\.csv$/);

    const fnNan = generateTaskExportFilename('json', { now: NaN });
    expect(fnNan).not.toContain('NaN');
    expect(fnNan).toMatch(/^wfs-tasks_\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('connection_spec — ketahanan badge koneksi saat now/lastOkAt bernilai non-finite', () => {
  it('applyPollResult aman saat now bernilai NaN (tidak menyimpan NaN ke state tracker)', () => {
    const t = applyPollResult(null, { ok: true }, NaN);
    expect(Number.isFinite(t.lastOkAt)).toBe(true);
    expect(Number.isFinite(t.updatedAt)).toBe(true);

    const f = applyPollResult(null, { ok: false, error: 'err' }, NaN);
    expect(Number.isFinite(f.lastFailAt)).toBe(true);
    expect(Number.isFinite(f.updatedAt)).toBe(true);
  });

  it('connectionBadge tidak menghasilkan "Sinkron NaN mnt lalu" saat now adalah NaN', () => {
    let t = applyPollResult(null, { ok: true }, 1000);
    t = applyPollResult(t, { ok: false, error: 'fail' }, 2000);
    expect(t.state).toBe('stale');

    const b = connectionBadge(t, NaN);
    expect(b.state).toBe('stale');
    expect(b.label).not.toContain('NaN');
    expect(b.detail).not.toContain('NaN');
  });

  it('connectionBadge tidak menghasilkan NaN bila tracker memiliki lastOkAt corrupted/NaN', () => {
    const corrupted = { state: 'stale', lastOkAt: NaN };
    const b = connectionBadge(corrupted, 5000);
    expect(b.label).not.toContain('NaN');
    expect(b.label).toBe('Sinkron 0 dtk lalu');
  });
});

describe('drift-gate konsumsi resolveNow di kanban_date & kanban_export', () => {
  it('kanban_date.js menggunakan resolveNow di ketiga call-site', () => {
    const content = readFileSync(join(LIB_DIR, 'kanban_date.js'), 'utf-8');
    const matches = content.match(/resolveNow\(options\.now\)/g) || [];
    expect(matches.length).toBe(3);
    expect(content).not.toMatch(/typeof options\.now === 'number'/);
  });

  it('kanban_export.js mengimpor dan menggunakan resolveNow', () => {
    const content = readFileSync(join(LIB_DIR, 'kanban_export.js'), 'utf-8');
    expect(content).toContain("import { formatTaskDate, resolveNow } from './kanban_date.js'");
    const matches = content.match(/resolveNow\(options\.now\)/g) || [];
    expect(matches.length).toBe(2);
  });
});
