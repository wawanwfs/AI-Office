// Siklus 358 — tanggal YYYY-MM-DD satu sumber: isoDateFromDate (format_time).
// snapshotFilename (snapshot_spec) & generateTaskExportFilename (kanban_export)
// kini memakai satu sumber; 0 salinan manual getFullYear+padStart tersisa.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isoDateFromDate } from '../lib/format_time.js';
import { snapshotFilename } from '../scene/parts/snapshot_spec.js';

describe('siklus 358 — isoDateFromDate satu sumber', () => {
  it('snapshotFilename tanpa salinan manual getFullYear/padStart', () => {
    const src = readFileSync(new URL('../scene/parts/snapshot_spec.js', import.meta.url), 'utf8');
    expect(src).toContain('isoDateFromDate');
    expect(src).not.toMatch(/getFullYear\(\)\s*\+/);
    expect(src).not.toContain("const p2");
  });

  it('kanban_export tanpa salinan manual getFullYear/padStart', () => {
    const src = readFileSync(new URL('../lib/kanban_export.js', import.meta.url), 'utf8');
    expect(src).toContain('isoDateFromDate');
    expect(src).not.toMatch(/getFullYear/);
  });

  it('paritas format YYYY-MM-DD + zero-pad', () => {
    expect(isoDateFromDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDateFromDate(new Date(2026, 10, 26))).toBe('2026-11-26');
  });

  it('anti-poisoning: non-Date / Date rusak → null', () => {
    expect(isoDateFromDate(null)).toBeNull();
    expect(isoDateFromDate('2026-01-01')).toBeNull();
    expect(isoDateFromDate(new Date('x'))).toBeNull();
    expect(isoDateFromDate(NaN)).toBeNull();
  });

  it('snapshotFilename: fallback netral & format utuh', () => {
    expect(snapshotFilename(null)).toBe('kantor-wfs.png');
    expect(snapshotFilename(new Date(2026, 0, 5, 7, 3))).toBe('kantor-wfs-2026-01-05_0703.png');
  });
});
