import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const landing = readFileSync(resolve(root, 'public/landing.html'), 'utf8');

describe('siklus 419: SEO landing — heading order, canonical, robots.txt', () => {
  it('tidak ada h3 di landing (h1 → h2 saja, heading order valid)', () => {
    expect(landing).not.toMatch(/<h3/i);
    expect(landing).toMatch(/<h1/);
    expect((landing.match(/<h2/g) || []).length).toBeGreaterThanOrEqual(7);
  });

  it('canonical link ada dan menunjuk origin produksi', () => {
    expect(landing).toMatch(/<link rel="canonical" href="http:\/\/161\.120\.180\.21:9503\/">/);
  });

  it('robots.txt ada di public/ dan dist ter-deploy, /app/ di-disallow', () => {
    const txt = readFileSync(resolve(root, 'public/robots.txt'), 'utf8');
    expect(txt).toMatch(/User-agent: \*/);
    expect(txt).toMatch(/Disallow: \/app\//);
    const distTxt = resolve(root, 'dist/robots.txt');
    if (existsSync(distTxt)) expect(readFileSync(distTxt, 'utf8')).toMatch(/Disallow: \/app\//);
  });

  it('guard: heading struktur landing = 1 h1, h2 >= 7, tanpa h3/h4/h5/h6', () => {
    expect((landing.match(/<h1/g) || []).length).toBe(1);
    for (const tag of ['h4', 'h5', 'h6']) expect(landing).not.toMatch(new RegExp(`<${tag}`, 'i'));
  });
});
