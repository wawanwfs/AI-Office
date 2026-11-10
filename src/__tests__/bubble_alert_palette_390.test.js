import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';

const ROOT = join(__dirname, '..', '..');
const src = readFileSync(join(ROOT, 'src', 'scene', 'OfficeScene.js'), 'utf8');

describe('siklus 390 — bubble alert scene delegasi palet', () => {
  it('tidak ada literal drift #f66 di OfficeScene.js', () => {
    expect(src.includes("'#f66'")).toBe(false);
  });

  it('bubble alert failed memakai TASK_STATUS_COLORS.failed', () => {
    expect(src).toMatch(/createBubble\([^)]*'Ada task failed! Cek log…',\s*TASK_STATUS_COLORS\.failed\)/);
  });

  it('palet kanonik tetap frozen dan failed = #EF4444', () => {
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true);
    expect(TASK_STATUS_COLORS.failed).toBe('#EF4444');
  });
});
