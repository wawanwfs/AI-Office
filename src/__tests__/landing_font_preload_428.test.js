import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const landing = readFileSync(resolve(root, 'public/landing.html'), 'utf8');
const dist = readFileSync(resolve(root, 'dist/landing.html'), 'utf8');
const fontsCss = readFileSync(resolve(root, 'public/fonts/fonts.css'), 'utf8');

const preloads = (html) =>
  [...html.matchAll(/<link rel="preload" href="([^"]+\.woff2)"/g)].map(m => m[1]);

describe('siklus 428: preload font landing lengkap', () => {
  it('landing memuat 3 preload font (Orbitron, DM Sans, DM Mono)', () => {
    expect(preloads(landing).length).toBe(3);
  });

  it('setiap preload URL ada di @font-face fonts.css (tanpa URL basi)', () => {
    const used = new Set([...fontsCss.matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => m[1]));
    for (const u of preloads(landing)) expect(used.has(u)).toBe(true);
  });

  it('preload punya as=font + crossorigin', () => {
    const tags = landing.match(/<link rel="preload"[^>]+woff2[^>]+>/g) || [];
    expect(tags.length).toBe(3);
    for (const t of tags) {
      expect(t).toContain('as="font"');
      expect(t).toContain('crossorigin');
    }
  });

  it('file fisik woff2 ada di public/fonts', () => {
    for (const u of preloads(landing)) {
      expect(existsSync(resolve(root, 'public', u.replace(/^\//, '')))).toBe(true);
    }
  });

  it('dist ter-deploy identik dengan public (3 preload)', () => {
    expect(preloads(dist)).toEqual(preloads(landing));
  });
});
