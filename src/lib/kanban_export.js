/**
 * Utilitas Murni Ekspor Task Kanban (CSV & JSON)
 * Menyediakan formatting baris CSV berstandar RFC 4180 dengan UTF-8 BOM,
 * serialisasi JSON berstruktur lengkap dengan metadata & metrik sprint,
 * serta penamaan berkas otomatis berbasis filter aktif.
 */
import { parseFileList } from './files.js';
import { formatTaskDate } from './kanban_date.js';
import {
  getTaskRoleLabel,
  getTaskPriorityInfo,
  extractTaskTags,
  computeSprintMetrics,
} from '../scene/parts/kanban_spec.js';
import { findTeamByRole, findTeamByAgent } from '../scene/parts/team_spec.js';

export const CSV_HEADERS = [
  'ID',
  'Judul',
  'Status',
  'Status_Label',
  'Prioritas',
  'Prioritas_Label',
  'Divisi',
  'Role',
  'Role_Label',
  'Agen',
  'Tag',
  'Jumlah_File',
  'Review_QA',
  'Tanggal',
  'Deskripsi',
];

export const STATUS_LABELS = {
  done: 'Selesai',
  running: 'Jalan',
  review: 'Review',
  failed: 'Gagal',
  pending: 'Antri',
};

/**
 * Format sel CSV individual: escape tanda kutip ganda dan bungkus dengan tanda kutip jika perlu.
 */
export function formatCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Gabungkan array sel menjadi satu baris CSV.
 */
export function formatCsvRow(cells) {
  if (!Array.isArray(cells)) return '';
  return cells.map(formatCsvCell).join(',');
}

/**
 * Konversi daftar task ke string CSV lengkap berstandar RFC 4180 dengan UTF-8 BOM.
 */
export function buildTaskCsv(tasks, options = {}) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const rows = [formatCsvRow(CSV_HEADERS)];

  for (const t of taskList) {
    if (!t || typeof t !== 'object') continue;
    const prio = getTaskPriorityInfo(t.priority);
    const roleLabel = getTaskRoleLabel(t.role);
    const team = findTeamByRole(t.role) || findTeamByAgent(t.agent_id);
    const divisionLabel = team ? team.fullName || team.name : 'Umum';
    const tags = extractTaskTags(t).join('; ');
    const fileCount = parseFileList(t.files).length;
    const statusLabel = STATUS_LABELS[t.status] || t.status || '';
    const dateFormatted = formatTaskDate(t, options);

    const row = [
      t.id != null ? t.id : '',
      t.title || '',
      t.status || '',
      statusLabel,
      prio.key || t.priority || 'normal',
      prio.label || '',
      divisionLabel,
      t.role || '',
      roleLabel,
      t.agent_id || '',
      tags,
      fileCount,
      t.review || '',
      dateFormatted !== '—' ? dateFormatted : '',
      t.description || t.desc || '',
    ];
    rows.push(formatCsvRow(row));
  }

  const bom = options.includeBom !== false ? '\uFEFF' : '';
  return bom + rows.join('\r\n');
}

/**
 * Konversi daftar task ke format data JSON terstruktur lengkap dengan metadata dan metrik sprint.
 */
export function buildTaskJson(tasks, options = {}) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const exportDate = options.now ? new Date(options.now) : new Date();

  const formattedTasks = taskList
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const prio = getTaskPriorityInfo(t.priority);
      const roleLabel = getTaskRoleLabel(t.role);
      const team = findTeamByRole(t.role) || findTeamByAgent(t.agent_id);
      const divisionKey = team ? team.key : 'general';
      const divisionLabel = team ? team.fullName || team.name : 'Umum';
      const tags = extractTaskTags(t);
      const files = parseFileList(t.files);
      const statusLabel = STATUS_LABELS[t.status] || t.status || '';

      return {
        id: t.id,
        title: t.title || '',
        status: t.status || '',
        status_label: statusLabel,
        priority: prio.key || 'normal',
        priority_label: prio.label || 'Normal',
        division: divisionKey,
        division_label: divisionLabel,
        role: t.role || '',
        role_label: roleLabel,
        agent_id: t.agent_id || null,
        tags,
        file_count: files.length,
        files,
        review: t.review || null,
        description: t.description || t.desc || null,
        created_at: t.created_at || t.createdAt || null,
      };
    });

  const metrics = computeSprintMetrics(taskList, 'all');

  return {
    meta: {
      generator: 'WFS AI Office Kanban Export',
      version: '2.0',
      exported_at: exportDate.toISOString(),
      total_exported: formattedTasks.length,
      filters: {
        division: options.division || 'all',
        status: options.filter || 'all',
        tag: options.tag || 'all',
        tag_mode: options.tagMode || 'any',
        date_range: options.dateRange || 'all',
        search_query: options.q || '',
        sort_by: options.sortBy || 'newest',
      },
      sprint_metrics: metrics,
    },
    tasks: formattedTasks,
  };
}

/**
 * Hasilkan nama berkas ekspor deskriptif dan aman berbasis format & filter aktif.
 */
export function generateTaskExportFilename(format = 'csv', options = {}) {
  const ext = String(format || 'csv').toLowerCase().replace(/^\./, '');
  const now = options.now ? new Date(options.now) : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const parts = ['wfs-tasks'];

  if (options.division && options.division !== 'all') {
    const cleanDiv = String(options.division).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanDiv) parts.push(cleanDiv);
  }

  if (options.filter && options.filter !== 'all') {
    const cleanFilter = String(options.filter).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanFilter) parts.push(cleanFilter);
  }

  if (options.dateRange && options.dateRange !== 'all') {
    const cleanDate = String(options.dateRange).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (cleanDate) parts.push(cleanDate);
  }

  if (options.tag && options.tag !== 'all') {
    const tagList = Array.isArray(options.tag) ? options.tag : [options.tag];
    const cleanTag = tagList
      .map((t) => String(t).toLowerCase().replace(/[^a-z0-9_-]/g, ''))
      .filter(Boolean)
      .slice(0, 2)
      .join('-');
    if (cleanTag) parts.push(`tag-${cleanTag}`);
  }

  if (options.q && String(options.q).trim()) {
    const cleanQ = String(options.q).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 10);
    if (cleanQ) parts.push(`q-${cleanQ}`);
  }

  parts.push(dateStr);
  return `${parts.join('_')}.${ext}`;
}

/**
 * Unduh blob berkas di browser dengan pembuatan tag <a> sementara yang aman.
 */
export function downloadExportFile(content, filename, mimeType = 'text/plain') {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL?.createObjectURL ? window.URL.createObjectURL(blob) : null;
    if (!url) return false;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    link.setAttribute('data-testid', 'kanban-download-link');

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (window.URL?.revokeObjectURL) {
      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
      }, 500);
    }
    return true;
  } catch (err) {
    console.error('downloadExportFile error:', err);
    return false;
  }
}

/**
 * Fungsi orkestrator ekspor: memformat data, menghasilkan nama berkas, memicu unduhan, dan mengembalikan ringkasan.
 */
export function exportTasks(tasks, options = {}) {
  const format = String(options.format || 'csv').toLowerCase();
  const taskList = Array.isArray(tasks) ? tasks : [];
  let content = '';
  let mimeType = 'text/plain';

  if (format === 'json') {
    const jsonObj = buildTaskJson(taskList, options);
    content = JSON.stringify(jsonObj, null, 2);
    mimeType = 'application/json;charset=utf-8;';
  } else {
    content = buildTaskCsv(taskList, options);
    mimeType = 'text/csv;charset=utf-8;';
  }

  const filename = options.filename || generateTaskExportFilename(format, options);
  const downloaded = downloadExportFile(content, filename, mimeType);

  return {
    success: downloaded,
    format,
    filename,
    count: taskList.length,
    byteLength: content.length,
    content,
  };
}
