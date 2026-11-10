import { describe, it, expect } from 'vitest';
import { GREEN_ACCENT } from '../lib/ui_palette.js';

describe('Siklus 401 — plakat LEVEL 03 delegasi GREEN_ACCENT', () => {
  it('nilai kanonik cocok hex lama', () => {
    expect(GREEN_ACCENT).toBe('#10E5A0');
  });

  it('literal #10E5A0 hilang dari terraces.js', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../scene/parts/terraces.js', import.meta.url), 'utf8');
    expect(src.includes("'#10E5A0'")).toBe(false);
    expect(src).toContain('GREEN_ACCENT');
  });

  it('GREEN_ACCENT tetap ada di ui_palette (satu sumber)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../lib/ui_palette.js', import.meta.url), 'utf8');
    expect(src).toContain("export const GREEN_ACCENT = '#10E5A0'");
  });
});
