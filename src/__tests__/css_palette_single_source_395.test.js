import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Siklus 395 — palet status & aksen kanonik CSS satu sumber.
// index.css sebelumnya menyimpan 70 literal hex + 90 rgba() dari warna
// status/aksen yang sama dengan TASK_STATUS_COLORS & ACCENT_BLUE —
// setiap perubahan kanonik harus dilakukan dua kali (JS & CSS) → drift.
// Kini :root mengekspor --c-* (hex) dan --c-*-rgb (triplet rgba); seluruh
// aturan memakai var().

const css = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '..', 'index.css'),
  'utf8',
);

const root = css.slice(css.indexOf(':root'), css.indexOf('--bg:'));

it(':root mendefinisikan palet kanonik identik TASK_STATUS_COLORS', async () => {
  const { TASK_STATUS_COLORS } = await import('../lib/task_status_colors.js');
  expect(root).toContain(`--c-done: ${TASK_STATUS_COLORS.done};`);
  expect(root).toContain(`--c-running: ${TASK_STATUS_COLORS.running};`);
  expect(root).toContain(`--c-review: ${TASK_STATUS_COLORS.review};`);
  expect(root).toContain(`--c-failed: ${TASK_STATUS_COLORS.failed};`);
  expect(root).toContain(`--c-pending: ${TASK_STATUS_COLORS.pending};`);
  const { ACCENT_BLUE } = await import('../lib/ui_palette.js');
  expect(root).toContain(`--c-accent: ${ACCENT_BLUE};`);
});

it('tidak ada lagi literal hex drift di luar :root', () => {
  const body = css.slice(css.indexOf('--bg:'));
  for (const h of ['#10e5a0', '#f59e0b', '#60a5fa', '#ef4444', '#9aa7b8', '#4d9fff', '#448aff', '#fb7185', '#8b93a3']) {
    expect(body.toLowerCase().includes(h)).toBe(false);
  }
});

it('rgba komposisi memakai triplet var(--c-*-rgb)', () => {
  const body = css.slice(css.indexOf('--bg:'));
  expect(body).not.toMatch(/rgba\(\s*(16|245|96|239|154|77|251)\s*,/);
  expect(body).toMatch(/rgba\(var\(--c-failed-rgb\)/);
  expect(body).toMatch(/rgba\(var\(--c-accent-rgb\)/);
});
