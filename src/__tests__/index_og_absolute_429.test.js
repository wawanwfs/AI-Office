// Siklus 429: index.html OG/Twitter URL absolut + canonical, selaras landing (422).
// Defek riil: og:image/og:url/twitter:image di index.html masih relatif ("/og-image.png")
// sehingga crawler sosial (WhatsApp/Telegram/Facebook) yang butuh URL absolut
// gagal resolve preview gambar saat share path /app/ atau root.
import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const ORIGIN = 'http://161.120.180.21:9503';
const src = readFileSync('index.html', 'utf8');
const dist = 'dist/index.html';

describe('siklus 429 — index.html OG absolut + canonical', () => {
  it('og:image & twitter:image absolut', () => {
    expect(src).toContain(`<meta property="og:image" content="${ORIGIN}/og-image.png" />`);
    expect(src).toContain(`<meta name="twitter:image" content="${ORIGIN}/og-image.png" />`);
    expect(src).not.toMatch(/content="\/og-image\.png"/);
  });

  it('og:url absolut + canonical selaras', () => {
    expect(src).toContain(`<meta property="og:url" content="${ORIGIN}/" />`);
    expect(src).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
  });

  it('og:image:alt ada (paritas dengan landing 422)', () => {
    expect(src).toContain('og:image:alt');
  });

  it('dist ter-deploy memuat versi absolut', () => {
    expect(existsSync(dist)).toBe(true);
    expect(readFileSync(dist, 'utf8')).toContain(`og:image" content="${ORIGIN}/og-image.png`);
  });
});
