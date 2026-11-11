import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const index = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const landing = readFileSync(resolve(root, 'dist/landing.html'), 'utf8');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'dist/manifest.webmanifest'), 'utf8')
);

describe('index PWA parity 431', () => {
  it('index.html has manifest link injected by vite-plugin-pwa', () => {
    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });

  it('index.html has twitter:image:alt matching landing', () => {
    expect(index).toContain(
      '<meta name="twitter:image:alt" content="WFS Project HQ — Kantor AI 3D" />'
    );
    expect(landing).toContain('twitter:image:alt');
  });

  it('manifest start_url is the app root', () => {
    expect(manifest.start_url).toBe('/');
  });

  it('all manifest icons exist in dist', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(root, 'dist', icon.src.replace(/^\//, '')))).toBe(true);
    }
  });

  it('no duplicate manifest/locale links in index', () => {
    expect(index.match(/rel="manifest"/g)?.length).toBe(1);
    expect(index.match(/og:locale/g)?.length).toBe(1);
  });
});
