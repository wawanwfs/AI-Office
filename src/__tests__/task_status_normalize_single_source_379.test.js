// Siklus 379 — normalisasi status task satu sumber
// Sebelumnya peta alias status ('completed'/'in_progress'/'active'/'success'/'qa' dst)
// tersalin 3× dengan cakupan BERBEDA: projectboard_data (penuh), kanban_spec
// getKanbanColumnKey (tanpa 'working'/'success'/'resolved'), team_spec computeTeamStats
// (hanya 'done'/'completed'/'running'/'review'/'failed' — 'active' & 'in_progress'
// dihitung PENDING). Akibatnya task 'active' muncul di kolom Sedang Jalan tapi
// dihitung Antri di statistik tim.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { normalizeTaskStatus } from '../scene/parts/projectboard_data.js';
import {
  normalizeTaskStatus as nks,
  getKanbanColumnKey,
} from '../scene/parts/kanban_spec.js';
import { computeTeamStats } from '../scene/parts/team_spec.js';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('379 — normalisasi status satu sumber', () => {
  it('salinan peta alias manual hilang dari kanban_spec & team_spec', () => {
    const ks = read('scene/parts/kanban_spec.js');
    const ts = read('scene/parts/team_spec.js');
    // peta alias inline gaya lama tidak boleh ada lagi
    expect(ks).not.toMatch(/s === 'in_progress' \|\| s === 'active'/);
    expect(ks).not.toMatch(/st === 'running' \|\| st === 'in_progress'/);
    expect(ts).not.toMatch(/status === 'done' \|\| status === 'completed'/);
    // delegasi ada
    expect(ks).toMatch(/normalizeTaskStatus/);
    expect(ts).toMatch(/import \{ normalizeTaskStatus \} from '\.\/projectboard_data\.js'/);
  });

  it('paritas alias: ketiga eksport memberi hasil sama untuk 12 bentuk status', () => {
    const bentuk = ['done', 'completed', 'finished', 'resolved', 'success',
      'running', 'in_progress', 'active', 'working', 'failed', 'review', 'qa',
      'pending', 'todo', '', null, undefined, 42, 'RUNNING'];
    for (const b of bentuk) {
      expect(nks(b)).toBe(normalizeTaskStatus(b));
    }
  });

  it('nilai kanonik alias tercakup penuh (active/success kini dikenali)', () => {
    expect(normalizeTaskStatus('active')).toBe('running');
    expect(normalizeTaskStatus('success')).toBe('done');
    expect(normalizeTaskStatus('working')).toBe('running');
    expect(normalizeTaskStatus('resolved')).toBe('done');
    expect(getKanbanColumnKey('active')).toBe('running');
    expect(getKanbanColumnKey('failed')).toBe('review'); // API historis kolom kanban
  });

  it('computeTeamStats menghitung task alias (active/in_progress/success) benar', () => {
    const stats = computeTeamStats([
      { role: 'be', status: 'active' },
      { role: 'be', status: 'in_progress' },
      { role: 'be', status: 'success' },
      { role: 'be', status: 'done' },
      { role: 'be', status: 'apaaja' },
    ]);
    const be = stats.find((s) => s.key === 'core-be');
    expect(be.total).toBe(5);
    expect(be.running).toBe(2); // dulu 0 — dihitung pending
    expect(be.done).toBe(2);    // success ikut done
    expect(be.pending).toBe(1);
  });

  it('getKanbanColumnKey tetap memetakan failed/error/issue → kolom review', () => {
    expect(getKanbanColumnKey('failed')).toBe('review');
    expect(getKanbanColumnKey('error')).toBe('review');
    expect(getKanbanColumnKey('issue')).toBe('review');
    expect(getKanbanColumnKey(null)).toBe('pending');
  });
});
