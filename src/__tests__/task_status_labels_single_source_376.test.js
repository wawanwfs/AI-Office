// Siklus 376 — satu sumber LABEL status task (pelengkap warna siklus 373).
//
// Audit: TASK_STATUS_LABELS (task_status_colors) sudah satu sumber untuk UI,
// tapi salinan label masih ada di:
//   1. kanban_export.STATUS_LABELS — objek 5 entri duplikat penuh.
//   2. TeamStats.jsx — pasangan [['done','Selesai'],...] inline.
//   3. TaskBoard.jsx FILTERS — literal 'Antri'/'Jalan'/'Selesai'/'Gagal'.
// Geser label di satu situs tanpa lainnya = chip & CSV & filter tak konsisten.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('siklus 376 — label status task satu sumber', () => {
  it('kanban_export tanpa salinan STATUS_LABELS manual (re-export delegasi)', () => {
    const src = read('../lib/kanban_export.js');
    expect(src).not.toMatch(/done:\s*'Selesai'/);
    expect(src).toMatch(/TASK_STATUS_LABELS/);
  });

  it('TeamStats & TaskBoard tanpa pasangan label inline', () => {
    const ts = read('../components/TeamStats.jsx');
    expect(ts).not.toMatch(/\[\['done',\s*'Selesai'/);
    expect(ts).toMatch(/TASK_STATUS_LABELS/);
    const tb = read('../components/TaskBoard.jsx');
    expect(tb).not.toMatch(/\['pending',\s*'Antri'\]/);
  });

  it('kanonik: TASK_STATUS_LABELS 5 entri nilai benar', () => {
    const src = read('../lib/task_status_colors.js');
    expect(src).toMatch(/done:\s*'Selesai'/);
    expect(src).toMatch(/running:\s*'Jalan'/);
    expect(src).toMatch(/review:\s*'Review'/);
    expect(src).toMatch(/failed:\s*'Gagal'/);
    expect(src).toMatch(/pending:\s*'Antri'/);
  });

  it('paritas kanban_export.STATUS_LABELS === TASK_STATUS_LABELS', async () => {
    const { STATUS_LABELS } = await import('../lib/kanban_export.js');
    const { TASK_STATUS_LABELS } = await import('../lib/task_status_colors.js');
    expect(STATUS_LABELS).toEqual(TASK_STATUS_LABELS);
  });
});
