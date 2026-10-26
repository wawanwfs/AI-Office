import { describe, it, expect } from 'vitest';
import {
  matchTaskSearch,
  getSearchMatchSegments,
  calcSearchStats,
  getKanbanColumnSearchEmptyState,
} from '../lib/kanban_search';

describe('kanban_search — matchTaskSearch', () => {
  const sampleTask = {
    id: 42,
    title: 'Migrasi database OAuth2 & JWT #security',
    desc: 'Integrasi sistem autentikasi dengan Prisma ORM',
    agent_id: 'be-lead',
    role: 'be',
    status: 'running',
    priority: 'urgent',
    tags: ['auth', 'database', 'security'],
    files: ['prisma/schema.prisma', 'server.py'],
  };

  it('mengembalikan true jika query kosong, null, atau hanya spasi', () => {
    expect(matchTaskSearch(sampleTask, '')).toBe(true);
    expect(matchTaskSearch(sampleTask, null)).toBe(true);
    expect(matchTaskSearch(sampleTask, '   ')).toBe(true);
  });

  it('mengembalikan false jika task null atau bukan objek', () => {
    expect(matchTaskSearch(null, 'oauth')).toBe(false);
    expect(matchTaskSearch(undefined, 'oauth')).toBe(false);
    expect(matchTaskSearch('bukan-objek', 'oauth')).toBe(false);
  });

  it('mencocokkan berdasarkan ID numerik dan hashtag ID', () => {
    expect(matchTaskSearch(sampleTask, '42')).toBe(true);
    expect(matchTaskSearch(sampleTask, '#42')).toBe(true);
    expect(matchTaskSearch(sampleTask, '99')).toBe(false);
  });

  it('mencocokkan berdasarkan judul dan deskripsi', () => {
    expect(matchTaskSearch(sampleTask, 'oauth2')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'jwt')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'prisma')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'frontend')).toBe(false);
  });

  it('mencocokkan berdasarkan agent_id, role, dan label human-readable role', () => {
    expect(matchTaskSearch(sampleTask, 'be-lead')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'be')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'backend')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'frontend')).toBe(false);
  });

  it('mencocokkan berdasarkan status bahasa Inggris dan terjemahan bahasa Indonesia', () => {
    expect(matchTaskSearch(sampleTask, 'running')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'jalan')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'berjalan')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'selesai')).toBe(false);
    expect(matchTaskSearch(sampleTask, 'antri')).toBe(false);

    const pendingTask = { id: 1, title: 'Test', status: 'pending' };
    expect(matchTaskSearch(pendingTask, 'antri')).toBe(true);
    expect(matchTaskSearch(pendingTask, 'antrean')).toBe(true);

    const doneTask = { id: 2, title: 'Test 2', status: 'done' };
    expect(matchTaskSearch(doneTask, 'selesai')).toBe(true);
    expect(matchTaskSearch(doneTask, 'tuntas')).toBe(true);
  });

  it('mencocokkan berdasarkan prioritas dan label prioritas', () => {
    expect(matchTaskSearch(sampleTask, 'urgent')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'rendah')).toBe(false);

    const lowTask = { id: 3, title: 'Test 3', priority: 'low' };
    expect(matchTaskSearch(lowTask, 'low')).toBe(true);
    expect(matchTaskSearch(lowTask, 'rendah')).toBe(true);
  });

  it('mencocokkan tags dengan atau tanpa awalan hashtag', () => {
    expect(matchTaskSearch(sampleTask, 'security')).toBe(true);
    expect(matchTaskSearch(sampleTask, '#security')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'auth')).toBe(true);
    expect(matchTaskSearch(sampleTask, '#auth')).toBe(true);
  });

  it('mendukung query multi-token: seluruh token harus cocok (AND)', () => {
    expect(matchTaskSearch(sampleTask, 'be-lead urgent')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'database jalan #security')).toBe(true);
    expect(matchTaskSearch(sampleTask, 'database selesai')).toBe(false); // 'selesai' tidak cocok
  });
});

describe('kanban_search — getSearchMatchSegments', () => {
  it('mengembalikan teks utuh jika query kosong atau null', () => {
    expect(getSearchMatchSegments('Judul Task Sederhana', '')).toEqual([
      { text: 'Judul Task Sederhana', match: false },
    ]);
    expect(getSearchMatchSegments('Judul Task Sederhana', null)).toEqual([
      { text: 'Judul Task Sederhana', match: false },
    ]);
    expect(getSearchMatchSegments('', 'test')).toEqual([]);
    expect(getSearchMatchSegments(null, 'test')).toEqual([]);
  });

  it('memotong segmen dengan tepat untuk kata kunci tunggal', () => {
    const segments = getSearchMatchSegments('Perbaikan bug autentikasi OAuth', 'bug');
    expect(segments).toEqual([
      { text: 'Perbaikan ', match: false },
      { text: 'bug', match: true },
      { text: ' autentikasi OAuth', match: false },
    ]);
  });

  it('memotong segmen untuk beberapa kata kunci (multi-token)', () => {
    const segments = getSearchMatchSegments('Fix auth bug in React app', 'auth react');
    expect(segments).toEqual([
      { text: 'Fix ', match: false },
      { text: 'auth', match: true },
      { text: ' bug in ', match: false },
      { text: 'React', match: true },
      { text: ' app', match: false },
    ]);
  });

  it('toleran terhadap hashtag dalam query dan karakter khusus regex', () => {
    const seg1 = getSearchMatchSegments('Integrasi endpoint #api v2', '#api');
    expect(seg1.some((s) => s.match && s.text.toLowerCase() === 'api')).toBe(true);

    const seg2 = getSearchMatchSegments('Task [Core] testing (v1.2)', '[Core]');
    expect(seg2.some((s) => s.match && s.text === '[Core]')).toBe(true);
  });
});

describe('kanban_search — calcSearchStats', () => {
  const tasks = [
    { id: 1, title: 'Task 1', role: 'be', status: 'done', tags: ['sql'] },
    { id: 2, title: 'Task 2', role: 'be', status: 'running', tags: ['sql', 'api'] },
    { id: 3, title: 'Task 3', role: 'fe', status: 'pending', tags: ['react'] },
    { id: 4, title: 'Task 4', role: 'fe', status: 'done', tags: ['react', 'ui/ux'] },
  ];

  it('menghitung statistik dasar saat query kosong', () => {
    const stats = calcSearchStats(tasks, '');
    expect(stats.total).toBe(4);
    expect(stats.matched).toBe(4);
    expect(stats.hasQuery).toBe(false);
    expect(stats.isFiltered).toBe(false);
    expect(stats.matchRatio).toBe('4/4');
    expect(stats.pct).toBe(100);
  });

  it('menghitung statistik saat query menyaring subset task', () => {
    const stats = calcSearchStats(tasks, 'be');
    expect(stats.total).toBe(4);
    expect(stats.matched).toBe(2);
    expect(stats.hasQuery).toBe(true);
    expect(stats.isFiltered).toBe(true);
    expect(stats.matchRatio).toBe('2/4');
    expect(stats.pct).toBe(50);
  });

  it('mengakomodasi filter divisi dan tag dalam kalkulasi total', () => {
    const stats = calcSearchStats(tasks, 'done', { division: 'fe' });
    expect(stats.total).toBe(2); // FE tasks = 2
    expect(stats.matched).toBe(1); // FE + done = 1
    expect(stats.matchRatio).toBe('1/2');
    expect(stats.pct).toBe(50);
  });

  it('menangani tasks kosong atau null secara aman', () => {
    const emptyStats = calcSearchStats(null, 'test');
    expect(emptyStats).toEqual({
      total: 0,
      matched: 0,
      hasQuery: false,
      isFiltered: false,
      matchRatio: '0/0',
      pct: 0,
    });
  });
});

describe('kanban_search — getKanbanColumnSearchEmptyState', () => {
  it('mengembalikan pesan pencarian adaptif saat isSearching true', () => {
    const s1 = getKanbanColumnSearchEmptyState('pending', { isSearching: true, columnLabel: 'Antrean' });
    expect(s1.icon).toBe('🔍');
    expect(s1.text).toBe('Tidak ada task cocok di Antrean');

    const s2 = getKanbanColumnSearchEmptyState('done', { isSearching: true });
    expect(s2.icon).toBe('🔍');
    expect(s2.text).toBe('Tidak ada task cocok');
  });

  it('mengembalikan pesan empty state default saat isSearching false', () => {
    const s = getKanbanColumnSearchEmptyState('pending', { isSearching: false });
    expect(s.icon).toBe('✨');
    expect(s.text).toBe('Semua antrean terambil');
  });
});
