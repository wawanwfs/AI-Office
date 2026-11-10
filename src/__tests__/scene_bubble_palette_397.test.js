/**
 * Siklus 397 — warna bubble aksen scene (OfficeScene) delegasi satu sumber.
 *
 * Bubble welcome/whiteboard/proyek memakai literal #F59E0B (running) dan
 * #10E5A0 (done) — drift potensial dari TASK_STATUS_COLORS. Kini delegasi.
 * Literal hex karakter CEO (0xF59E0B identitas avatar Wahyu FS) memang
 * identitas visual karakter, BUKAN warna status — tetap boleh literal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js';

const root = join(import.meta.dirname, '..', '..');
const scene = readFileSync(join(root, 'src', 'scene', 'OfficeScene.js'), 'utf8');

test('tidak ada literal bubble #F59E0B / #10E5A0 di OfficeScene', () => {
  expect(scene).not.toMatch(/createBubble\([^)]*'#F59E0B'/);
  expect(scene).not.toMatch(/'#10E5A0'\s*\)/);
  expect(scene).not.toMatch(/(fillStyle|shadowColor)\s*=\s*'#10E5A0'/);
});

test('delegasi TASK_STATUS_COLORS.running/.done hadir di scene', () => {
  expect(scene).toContain('TASK_STATUS_COLORS.running');
  expect(scene).toContain('TASK_STATUS_COLORS.done');
  expect(TASK_STATUS_COLORS.running).toBe('#F59E0B');
  expect(TASK_STATUS_COLORS.done).toBe('#10E5A0');
});
