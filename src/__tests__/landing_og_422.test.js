import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const src = readFileSync('public/landing.html', 'utf8');
const dist = 'dist/landing.html';

describe('siklus 422 — OG/Twitter absolute URL', () => {
  const ORIGIN = 'http://161.120.180.21:9503';

  it('og:image & twitter:image absolut (bukan relatif)', () => {
    expect(src).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.png">`);
    expect(src).toContain(`<meta name="twitter:image" content="${ORIGIN}/og-image.png">`);
    expect(src).not.toMatch(/content="\/og-image\.png"/);
  });

  it('og:url absolut', () => {
    expect(src).toContain(`<meta property="og:url" content="${ORIGIN}/">`);
  });

  it('og:locale id_ID dan twitter:image:alt ada', () => {
    expect(src).toContain('<meta property="og:locale" content="id_ID">');
    expect(src).toContain('twitter:image:alt');
  });

  it('dist ter-deploy memuat versi absolut', () => {
    expect(existsSync(dist)).toBe(true);
    expect(readFileSync(dist, 'utf8')).toContain(`og:image" content="${ORIGIN}/og-image.png`);
  });
});
