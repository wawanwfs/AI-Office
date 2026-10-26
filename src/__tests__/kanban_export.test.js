// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatCsvCell,
  formatCsvRow,
  buildTaskCsv,
  buildTaskJson,
  generateTaskExportFilename,
  downloadExportFile,
  exportTasks,
  CSV_HEADERS,
  STATUS_LABELS,
} from '../lib/kanban_export.js';

const MOCK_TASKS = [
  {
    id: 101,
    title: 'Implementasi JWT Auth & "Refresh" Token',
    status: 'done',
    priority: 'urgent',
    role: 'backend',
    agent_id: 'wfs-core-1',
    tags: ['backend', 'security'],
    files: 'auth.py, jwt.py',
    review: 'Audit selesai 100%',
    description: 'Modul auth berbasis token JWT.',
    created_at: '2026-10-26T10:00:00Z',
  },
  {
    id: 102,
    title: 'Desain UI Kanban & Dialog Ekspor, CSV/JSON',
    status: 'running',
    priority: 'high',
    role: 'design',
    agent_id: 'wfs-design-1',
    tags: ['ui', 'kanban'],
    files: "['TaskBoard.jsx', 'kanban_export.js']",
    review: null,
    description: 'Komponen UI responsif dengan dialog ekspor.',
    created_at: '2026-10-26T11:00:00Z',
  },
  {
    id: 103,
    title: 'Uji Penetrasi API & Keamanan',
    status: 'pending',
    priority: 'normal',
    role: 'sec',
    agent_id: 'wfs-sec-1',
    tags: 'security, audit',
    files: '',
    review: '',
    description: 'Blackbox testing endpoint publik.',
    created_at: '2026-10-26T12:00:00Z',
  },
];

describe('kanban_export: formatCsvCell & formatCsvRow', () => {
  it('formatCsvCell mengubah null dan undefined menjadi string kosong', () => {
    expect(formatCsvCell(null)).toBe('');
    expect(formatCsvCell(undefined)).toBe('');
  });

  it('formatCsvCell mempertahankan teks biasa dan angka tanpa tanda kutip', () => {
    expect(formatCsvCell('TaskBoard')).toBe('TaskBoard');
    expect(formatCsvCell(101)).toBe('101');
    expect(formatCsvCell(0)).toBe('0');
  });

  it('formatCsvCell membungkus teks berisi koma dengan tanda kutip', () => {
    expect(formatCsvCell('auth.py, jwt.py')).toBe('"auth.py, jwt.py"');
  });

  it('formatCsvCell melipatgandakan tanda kutip ganda internal (" -> "")', () => {
    expect(formatCsvCell('Modul "Auth"')).toBe('"Modul ""Auth"""');
  });

  it('formatCsvCell menangani teks multiline / newline secara aman', () => {
    expect(formatCsvCell("Baris 1\nBaris 2")).toBe('"Baris 1\nBaris 2"');
    expect(formatCsvCell("Baris 1\r\nBaris 2")).toBe('"Baris 1\r\nBaris 2"');
  });

  it('formatCsvRow menggabungkan array sel dengan pemisah koma', () => {
    expect(formatCsvRow(['101', 'Auth', 'done'])).toBe('101,Auth,done');
    expect(formatCsvRow(['101', 'Auth, JWT', 'done'])).toBe('101,"Auth, JWT",done');
    expect(formatCsvRow([])).toBe('');
    expect(formatCsvRow(null)).toBe('');
  });
});

describe('kanban_export: buildTaskCsv', () => {
  it('menghasilkan CSV lengkap dengan header dan UTF-8 BOM secara default', () => {
    const csv = buildTaskCsv(MOCK_TASKS);
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines.length).toBe(MOCK_TASKS.length + 1);
    expect(lines[0]).toBe(CSV_HEADERS.join(','));
  });

  it('mendukung opsi includeBom: false untuk output CSV tanpa BOM', () => {
    const csv = buildTaskCsv(MOCK_TASKS, { includeBom: false });
    expect(csv.startsWith('\uFEFF')).toBe(false);
  });

  it('memformat kolom baris task dengan akurat (ID, judul, status, prioritas, divisi, agen, tag, file count)', () => {
    const csv = buildTaskCsv([MOCK_TASKS[0]], { includeBom: false });
    const [, row] = csv.split('\r\n');

    expect(row).toContain('101');
    expect(row).toContain('"Implementasi JWT Auth & ""Refresh"" Token"');
    expect(row).toContain('done');
    expect(row).toContain(STATUS_LABELS.done); // Selesai
    expect(row).toContain('urgent');
    expect(row).toContain('Urgent');
    expect(row).toContain('backend');
    expect(row).toContain('wfs-core-1');
    expect(row).toContain('2'); // Jumlah file
    expect(row).toContain('Audit selesai 100%');
  });

  it('menangani daftar task kosong atau null tanpa crash', () => {
    const csvEmpty = buildTaskCsv([], { includeBom: false });
    expect(csvEmpty).toBe(CSV_HEADERS.join(','));

    const csvNull = buildTaskCsv(null, { includeBom: false });
    expect(csvNull).toBe(CSV_HEADERS.join(','));
  });
});

describe('kanban_export: buildTaskJson', () => {
  it('menghasilkan struktur JSON berstruktur dengan metadata lengkap dan metrik sprint', () => {
    const json = buildTaskJson(MOCK_TASKS, {
      division: 'core-be',
      filter: 'done',
      tag: 'backend',
      q: 'jwt',
      now: '2026-10-26T12:30:00Z',
    });

    expect(json.meta).toBeDefined();
    expect(json.meta.generator).toBe('WFS AI Office Kanban Export');
    expect(json.meta.exported_at).toBe('2026-10-26T12:30:00.000Z');
    expect(json.meta.total_exported).toBe(3);
    expect(json.meta.filters.division).toBe('core-be');
    expect(json.meta.filters.status).toBe('done');
    expect(json.meta.filters.tag).toBe('backend');
    expect(json.meta.filters.search_query).toBe('jwt');
    expect(json.meta.sprint_metrics.total).toBe(3);
    expect(json.meta.sprint_metrics.done).toBe(1);

    expect(Array.isArray(json.tasks)).toBe(true);
    expect(json.tasks.length).toBe(3);

    const first = json.tasks[0];
    expect(first.id).toBe(101);
    expect(first.title).toBe('Implementasi JWT Auth & "Refresh" Token');
    expect(first.status).toBe('done');
    expect(first.status_label).toBe('Selesai');
    expect(first.priority).toBe('urgent');
    expect(first.priority_label).toBe('Urgent');
    expect(first.file_count).toBe(2);
    expect(first.files).toEqual(['auth.py', 'jwt.py']);
  });

  it('menangani array kosong atau item tidak valid pada JSON', () => {
    const json = buildTaskJson([null, undefined], { now: '2026-10-26T12:00:00Z' });
    expect(json.tasks).toEqual([]);
    expect(json.meta.total_exported).toBe(0);
  });
});

describe('kanban_export: generateTaskExportFilename', () => {
  const fixedNow = new Date('2026-10-26T15:00:00Z');

  it('menghasilkan nama berkas CSV default tanpa filter aktif', () => {
    const name = generateTaskExportFilename('csv', { now: fixedNow });
    expect(name).toBe('wfs-tasks_2026-10-26.csv');
  });

  it('menghasilkan nama berkas JSON dengan ekstensi yang sesuai', () => {
    const name = generateTaskExportFilename('json', { now: fixedNow });
    expect(name).toBe('wfs-tasks_2026-10-26.json');
  });

  it('menyertakan divisi, status, dan tag aktif dalam nama berkas', () => {
    const name = generateTaskExportFilename('csv', {
      division: 'core',
      filter: 'done',
      tag: 'security',
      now: fixedNow,
    });
    expect(name).toBe('wfs-tasks_core_done_tag-security_2026-10-26.csv');
  });

  it('membersihkan karakter khusus dan spasi agar aman untuk filesystem', () => {
    const name = generateTaskExportFilename('csv', {
      division: 'core/engine!',
      filter: 'running (aktif)',
      q: 'auth / login',
      now: fixedNow,
    });
    expect(name).toContain('wfs-tasks_coreengine_runningaktif_q-authlogin_');
    expect(name.endsWith('.csv')).toBe(true);
  });
});

describe('kanban_export: downloadExportFile & exportTasks', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloadExportFile membuat tag <a> dan memicu klik di DOM', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    const ok = downloadExportFile('test content', 'wfs-test.csv', 'text/csv');
    expect(ok).toBe(true);
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('exportTasks format CSV mengorkestrasi pembuatan CSV dan unduhan', () => {
    const res = exportTasks(MOCK_TASKS, {
      format: 'csv',
      division: 'core',
      filter: 'all',
      filename: 'custom-export.csv',
    });

    expect(res.success).toBe(true);
    expect(res.format).toBe('csv');
    expect(res.filename).toBe('custom-export.csv');
    expect(res.count).toBe(3);
    expect(res.byteLength).toBeGreaterThan(50);
    expect(res.content.startsWith('\uFEFF')).toBe(true);
  });

  it('exportTasks format JSON mengorkestrasi pembuatan JSON dan unduhan', () => {
    const res = exportTasks(MOCK_TASKS, {
      format: 'json',
      division: 'all',
      filter: 'all',
    });

    expect(res.success).toBe(true);
    expect(res.format).toBe('json');
    expect(res.filename.endsWith('.json')).toBe(true);
    expect(res.count).toBe(3);

    const parsed = JSON.parse(res.content);
    expect(parsed.meta.generator).toBe('WFS AI Office Kanban Export');
    expect(parsed.tasks.length).toBe(3);
  });
});
