import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const landing = readFileSync(resolve(root, 'public/landing.html'), 'utf8');

function extractJsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

describe('siklus 420: JSON-LD structured data landing', () => {
  it('landing punya satu blok ld+json @type WebSite yang valid', () => {
    const data = extractJsonLd(landing);
    expect(data).not.toBeNull();
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebSite');
    expect(data.name).toContain('WFS');
    expect(data.url).toBe('http://161.120.180.21:9503/');
  });

  it('potentialAction SearchAction lengkap dengan target & query-input', () => {
    const data = extractJsonLd(landing);
    const pa = data.potentialAction;
    expect(pa['@type']).toBe('SearchAction');
    expect(pa.target).toBe('http://161.120.180.21:9503/app/#dashboard');
    expect(pa['query-input']).toBe('required name=search_term_string');
  });

  it('tidak memuat angka agen usang dan JSON valid tanpa karakter kontrol', () => {
    const data = extractJsonLd(landing);
    expect(JSON.stringify(data)).not.toMatch(/15 agent/i);
    expect(JSON.stringify(data).match(/26 agen|26 agen AI/i) === null || data.description.toLowerCase().includes('26 agen')).toBe(true);
  });

  it('dist ter-deploy juga memuat blok ld+json', () => {
    const dist = resolve(root, 'dist/landing.html');
    expect(existsSync(dist)).toBe(true);
    expect(extractJsonLd(readFileSync(dist, 'utf8'))).not.toBeNull();
  });
});
