import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(process.cwd(), 'public/landing.html'), 'utf8');
const dist = (() => {
  try { return readFileSync(resolve(process.cwd(), 'dist/landing.html'), 'utf8'); }
  catch { return ''; }
})();

describe('landing font preload (425)', () => {
  it('preload Orbitron latin (heading) ada dgn as=font & crossorigin', () => {
    expect(src).toContain('href="/fonts/yMJRMIlzdpvBhQQL_Qq7dy0.woff2"');
    expect(src).toContain('as="font"');
    expect(src).toContain('crossorigin');
  });
  it('preload DM Sans latin (body) ada', () => {
    expect(src).toContain('href="/fonts/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2"');
  });
  it('stylesheet fonts.css tetap ada (tidak diganti preload)', () => {
    expect(src).toContain('<link rel="stylesheet" href="/fonts/fonts.css">');
  });
  it('dist ter-deploy memuat preload yang sama', () => {
    expect(dist).toContain('yMJRMIlzdpvBhQQL_Qq7dy0.woff2');
    expect(dist).toContain('rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2');
  });
});
