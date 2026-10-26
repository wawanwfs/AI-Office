/**
 * kanban_search.js — Utilitas murni pencarian real-time dan analisis kecocokan Kanban.
 * Menyediakan multi-token query matching, pemotongan segmen teks untuk penyorotan (highlighting),
 * kalkulasi statistik pencarian/filter, serta resolusi empty state adaptif untuk kolom Kanban.
 */

import {
  matchTaskDivision,
  matchTaskTags,
  getKanbanColumnEmptyState,
  matchTaskSearch,
} from '../scene/parts/kanban_spec';

export { matchTaskSearch };

/**
 * Memecah string teks menjadi array segmen { text: string, match: boolean }
 * untuk penyorotan kata kunci pencarian pada kartu atau baris daftar secara aman tanpa XSS.
 *
 * @param {string} text
 * @param {string} query
 * @returns {Array<{ text: string, match: boolean }>}
 */
export function getSearchMatchSegments(text, query) {
  if (!text || typeof text !== 'string') return [];
  if (!query || typeof query !== 'string') return [{ text, match: false }];

  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[#@]/, ''))
    .filter((t) => t.length > 0);

  if (!tokens.length) return [{ text, match: false }];

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(regex);
  const segments = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const isMatch = tokens.some((t) => t.toLowerCase() === part.toLowerCase());
    segments.push({ text: part, match: isMatch });
  }

  return segments.length > 0 ? segments : [{ text, match: false }];
}

/**
 * Menghitung statistik pencarian task secara real-time terhadap kumpulan task.
 * Membandingkan jumlah task yang lolos pencarian terhadap jumlah task pada cakupan divisi & tag aktif.
 *
 * @param {Array<object>} tasks
 * @param {string} query
 * @param {object} [options]
 * @param {string} [options.division='all']
 * @param {string|Array<string>} [options.tag='all']
 * @param {string} [options.tagMode='any']
 * @returns {{ total: number, matched: number, hasQuery: boolean, isFiltered: boolean, matchRatio: string, pct: number }}
 */
export function calcSearchStats(tasks, query, { division = 'all', tag = 'all', tagMode = 'any' } = {}) {
  if (!Array.isArray(tasks) || !tasks.length) {
    return {
      total: 0,
      matched: 0,
      hasQuery: false,
      isFiltered: false,
      matchRatio: '0/0',
      pct: 0,
    };
  }

  const q = String(query || '').trim();
  const hasQuery = Boolean(q);
  const isFiltered = hasQuery || division !== 'all' || (tag && tag !== 'all');

  const scoped = tasks.filter((t) => {
    if (!t) return false;
    if (division !== 'all' && !matchTaskDivision(t, division)) return false;
    if (tag && tag !== 'all' && !matchTaskTags(t, tag, tagMode)) return false;
    return true;
  });

  const matched = hasQuery
    ? scoped.filter((t) => matchTaskSearch(t, q)).length
    : scoped.length;

  const total = scoped.length;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;

  return {
    total,
    matched,
    hasQuery,
    isFiltered,
    matchRatio: `${matched}/${total}`,
    pct,
  };
}

/**
 * Mengembalikan konfigurasi empty-state kolom kanban yang adaptif terhadap status pencarian/filter.
 * Saat pencarian aktif, pesan berubah ramah kontekstual ("Tidak ada task cocok di kolom ...").
 *
 * @param {string} columnKey
 * @param {object} [options]
 * @param {boolean} [options.isSearching=false]
 * @param {string} [options.columnLabel='']
 * @returns {{ icon: string, text: string }}
 */
export function getKanbanColumnSearchEmptyState(columnKey, { isSearching = false, columnLabel = '' } = {}) {
  if (isSearching) {
    return {
      icon: '🔍',
      text: columnLabel ? `Tidak ada task cocok di ${columnLabel}` : 'Tidak ada task cocok',
    };
  }
  return getKanbanColumnEmptyState(columnKey);
}
