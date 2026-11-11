import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('public/landing.html', 'utf8');
let dist = '';
try { dist = readFileSync('/home/agentuser/wfs-hq/landing.html', 'utf8'); } catch {}

describe('siklus 421: ikon landing diberi label a11y', () => {
  it('semua ikon kartu fitur punya role=img + aria-label', () => {
    const ics = src.match(/class="ic"[^>]*>/g) || [];
    expect(ics.length).toBe(6);
    for (const ic of ics) {
      expect(ic).toContain('role="img"');
      expect(ic).toContain('aria-label=');
    }
  });

  it('emoji di link CTA dibungkus aria-hidden', () => {
    expect(src).toContain('<span aria-hidden="true">🚀</span>');
    expect(src).toContain('<span aria-hidden="true">📊</span>');
    expect(src).not.toMatch(/href="\/app\/">🚀/);
  });

  it('dist ter-deploy memuat label juga', () => {
    if (dist) {
      expect(dist.match(/role="img"/g)?.length).toBe(6);
      expect(dist).toContain('aria-hidden="true">🚀');
    }
  });

  it('tidak mengubah struktur lain (7 h2 tetap)', () => {
    expect(src.match(/<h2>/g)?.length).toBe(7);
    expect(src).toContain('application/ld+json');
  });
});
