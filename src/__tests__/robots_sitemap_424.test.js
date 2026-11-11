// Siklus 424 — robots.txt → Sitemap directive (pelengkap sitemap.xml siklus 423).
// Crawler menemukan sitemap hanya lewat directive `Sitemap:` absolut di robots.txt.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const origin = 'http://161.120.180.21:9503';

const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('siklus 424: directive Sitemap di robots.txt', () => {
  it('robots.txt di public/ memuat directive Sitemap absolut', () => {
    const txt = read('public/robots.txt');
    const line = txt.split('\n').find((l) => l.startsWith('Sitemap:'));
    expect(line).toBeDefined();
    expect(line.trim()).toBe(`Sitemap: ${origin}/sitemap.xml`);
  });

  it('URL sitemap pada directive sama dengan entri di sitemap.xml (lokasi self-referencing tidak wajib, tapi konsisten)', () => {
    const txt = read('public/robots.txt');
    const url = txt.match(/^Sitemap:\s*(\S+)/m)[1];
    const sm = read('public/sitemap.xml');
    expect(sm).toContain('<loc>http://161.120.180.21:9503/landing.html</loc>');
    expect(url.startsWith(origin)).toBe(true);
  });

  it('disallow privat tetap utuh (tidak terhapus saat edit)', () => {
    const txt = read('public/robots.txt');
    for (const d of ['Disallow: /app/', 'Disallow: /api/', 'Disallow: /cs-widget/']) {
      expect(txt).toContain(d);
    }
    expect(txt).toContain('User-agent: *');
  });

  it('dist ter-deploy memuat directive yang sama', () => {
    const dist = read('dist/robots.txt');
    expect(dist).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(dist).toContain('Disallow: /app/');
  });
});
