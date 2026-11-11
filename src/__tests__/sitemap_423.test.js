import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Siklus 423 — sitemap.xml untuk crawler (pelengkap robots.txt siklus 419).
// Sitemap mendeklarasikan halaman publik (landing + root) dgn origin absolut.
const root = resolve(__dirname, '../..');
const ORIGIN = 'http://161.120.180.21:9503';

describe('siklus 423: sitemap.xml SEO', () => {
  const src = readFileSync(resolve(root, 'public/sitemap.xml'), 'utf8');

  it('sitemap.xml valid: xmlns sitemap 0.9 + urlset', () => {
    expect(src).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(src).toContain('<urlset');
    expect(src).toContain('</urlset>');
    expect(src).toContain('<?xml');
  });

  it('memuat landing + root dgn URL absolut origin produksi', () => {
    expect(src).toContain(`<loc>${ORIGIN}/landing.html</loc>`);
    expect(src).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(src).not.toMatch(/<loc>\/(?!\/)/); // tanpa URL relatif
  });

  it('tidak mengekspos /app/ atau /api/ (area privat robots.txt)', () => {
    expect(src).not.toContain('/app/');
    expect(src).not.toContain('/api/');
  });

  it('dist ter-deploy memuat sitemap identik (bila build sudah jalan)', () => {
    const dist = resolve(root, 'dist/sitemap.xml');
    if (existsSync(dist)) {
      expect(readFileSync(dist, 'utf8')).toBe(src);
    }
  });
});
