import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Siklus 396 — MUTED_TEXT & SKY_BUTTON satu sumber.
 * Literal #8fa2c4 (teks muted) dan #38bdf8 (tombol sky) tak boleh
 * diketik ulang di komponen UI.
 */
const MOD = 'src/lib/ui_palette.js';
const src = readFileSync(MOD, 'utf8');

describe('siklus 396 — warna muted & sky satu sumber', () => {
  it('ui_palette mendefinisikan MUTED_TEXT=#8fa2c4 dan SKY_BUTTON=#38bdf8', () => {
    expect(src).toMatch(/export const MUTED_TEXT = '#8fa2c4'/);
    expect(src).toMatch(/export const SKY_BUTTON = '#38bdf8'/);
  });

  it('tidak ada literal #8fa2c4 / #38bdf8 tersisa di komponen', () => {
    const files = ['src/components/ShConsole.jsx', 'src/components/SettingsModal.jsx'];
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/#8fa2c4/i);
      expect(s, f).not.toMatch(/#38bdf8/i);
    }
  });

  it('ShConsole & SettingsModal mengimpor dari ui_palette', () => {
    expect(readFileSync('src/components/ShConsole.jsx', 'utf8'))
      .toMatch(/import \{ MUTED_TEXT, BRIGHT_TEXT, FAINT_META, PANEL_BORDER \} from '\.\.\/lib\/ui_palette'/);
    expect(readFileSync('src/components/SettingsModal.jsx', 'utf8'))
      .toMatch(/SKY_BUTTON/);
  });
});
