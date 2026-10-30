// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import QuickToolbar from '../components/QuickToolbar.jsx';

// Siklus 182 — tombol dock AGEN: paritas tombol FOTO (179) dgn shortcut C (181).
// Fungsi inti siklus agen (nextAgentIndex, cycleAgent scene, guard exception
// inspector) SUDAH diuji penuh di agent_cycle.test.js — di sini hanya wiring
// tombol: prop opsional, delegasi murni, ikon + label.

const __dir = dirname(fileURLToPath(import.meta.url));
const __root = join(__dir, '../..');
const readSrc = (p) => readFileSync(join(__root, p), 'utf8');

const noop = () => {};
afterEach(() => cleanup()); // anti bocor DOM antar test (render menumpuk)
const baseProps = {
  onAddTask: noop,
  onPauseAll: noop,
  onResumeAll: noop,
  onToggleTheme: noop,
  theme: true,
  onZoomIn: noop,
  onZoomOut: noop,
  onSetView: noop,
};

describe('tombol AGEN dock — render & delegasi', () => {
  it('dirender bila onCycleAgent ada: label "Agen" + title menyebut shortcut C', () => {
    render(<QuickToolbar {...baseProps} onCycleAgent={noop} />);
    const btn = screen.getByRole('button', { name: 'Agen berikutnya' });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title')).toContain('shortcut C');
    expect(btn.textContent).toContain('Agen');
  });

  it('TIDAK dirender tanpa prop onCycleAgent (kompat — pola onSnapshot)', () => {
    render(<QuickToolbar {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Agen berikutnya' })).toBeNull();
  });

  it('klik → onCycleAgent(false) maju (aksi eksplisit, bukan event DOM)', () => syntheticOnce());
  function syntheticOnce() {
    const calls = [];
    const { unmount } = render(
      <QuickToolbar {...baseProps} onCycleAgent={(b) => calls.push(b)} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agen berikutnya' }));
    expect(calls).toEqual([false]);
    unmount();
  }

  it('ikon IconUserNext terpasang di tombol (paritas visual dock)', () => {
    render(<QuickToolbar {...baseProps} onCycleAgent={noop} />);
    const btn = screen.getByRole('button', { name: 'Agen berikutnya' });
    expect(btn.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});

describe('wiring tombol AGEN — kontrak statis', () => {
  it('QuickToolbar: tombol dipasangkan dgn prop onCycleAgent', () => {
    const src = readSrc('src/components/QuickToolbar.jsx');
    expect(src).toContain('onCycleAgent &&');
  });

  it('App: tombol AGEN delegasi murni sceneControls.cycleAgent (tanpa logika siklus inline)', () => {
    const src = readSrc('src/App.jsx');
    const i = src.indexOf('onCycleAgent={(backward)');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, i + 400);
    expect(block).toContain('s.cycleAgent(backward === true)');
    // delegasi murni: tidak ada formula indeks inline di handler tombol
    expect(block).not.toMatch(/nextAgentIndex|\bmod\b/);
  });

  it('ikon baru ter-ekspor dari Icons.jsx (IconUserNext)', () => {
    expect(readSrc('src/components/Icons.jsx')).toContain('export function IconUserNext');
  });
});
