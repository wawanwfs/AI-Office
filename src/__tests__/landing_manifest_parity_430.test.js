import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const dist = 'dist/';
const read = (p) => readFileSync(dist + p, 'utf8');

describe('Siklus 430: manifest di landing + og:locale & twitter:image:alt paritas', () => {
  it('landing.html memuat <link rel="manifest" href="/manifest.webmanifest">', () => {
    const landing = read('landing.html');
    expect(landing).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });

  it('landing.html punya twitter:image:alt sejajar og:image:alt', () => {
    const landing = read('landing.html');
    expect(landing).toContain('<meta name="twitter:image:alt" content="WFS Project HQ — Kantor AI 3D">');
    expect(landing).toContain('<meta property="og:image:alt" content="WFS Project HQ — Kantor AI 3D">');
  });

  it('index.html punya og:locale id_ID (paritas dengan landing)', () => {
    const index = read('index.html');
    expect(index).toContain('<meta property="og:locale" content="id_ID" />');
    // tanpa duplikat
    expect(index.match(/og:locale/g)).toHaveLength(1);
  });

  it('manifest.webmanifest ter-deploy di dist dan direferensikan icons valid', () => {
    expect(existsSync(dist + 'manifest.webmanifest')).toBe(true);
    const m = JSON.parse(read('manifest.webmanifest'));
    for (const icon of m.icons) {
      expect(icon.src.startsWith('/')).toBe(true);
      expect(existsSync(dist + icon.src.slice(1))).toBe(true);
    }
  });

  it('tidak ada duplikat twitter:image:alt di landing dist', () => {
    const landing = read('landing.html');
    expect(landing.match(/twitter:image:alt/g)).toHaveLength(1);
  });
});
