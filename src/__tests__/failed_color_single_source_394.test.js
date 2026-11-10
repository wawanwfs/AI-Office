import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';
import { FAILED_RGB, failedAlpha, ACCENT_BLUE } from '../lib/ui_palette.js';

const sm = readFileSync('src/components/SettingsModal.jsx', 'utf8');
const up = readFileSync('src/lib/ui_palette.js', 'utf8');

describe('siklus 394 — warna failed SettingsModal satu sumber', () => {
  it('literal drift #fb7185 / rgba(251,113,133) hilang dari SettingsModal', () => {
    expect(sm).not.toMatch(/#fb7185/i);
    expect(sm).not.toMatch(/rgba\(251,\s*113,\s*133/);
  });

  it('delegasi TASK_STATUS_COLORS.failed + failedAlpha terpakai', () => {
    expect(sm.match(/TASK_STATUS_COLORS\.failed/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sm).toContain('failedAlpha');
    expect(sm).toContain("import { accentAlpha, failedAlpha }");
  });

  it('palet kanonik & helper frozen/konsisten', () => {
    expect(TASK_STATUS_COLORS.failed).toBe('#EF4444');
    expect(FAILED_RGB).toBe('239,68,68');
    expect(failedAlpha(0.15)).toBe('rgba(239,68,68,0.15)');
    expect(failedAlpha(1.5)).toBeNull(); // anti-poisoning
    expect(up).toContain(ACCENT_BLUE); // helper tetap satu file
  });
});
