// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import QuickToolbar from '../components/QuickToolbar.jsx';
import { IconUserPrev } from '../components/Icons.jsx';

// Siklus 183 — tombol dock AGEN MUNDUR: paritas Shift+C (181), pola pasangan
// Jauh/Dekat & Iso/Depan/Atas. Pola pengujian salinan agent_button.test.jsx (182):
// fungsi inti siklus agen (nextAgentIndex, cycleAgent scene, guard exception
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

describe('Tombol dock AGEN MUNDUR (siklus 183, paritas Shift+C)', () => {
  it('dirender bila onCycleAgentBack ada: label "Mundur" + title menyebut Shift+C', () => {
    render(<QuickToolbar {...baseProps} onCycleAgentBack={noop} />);
    const btn = screen.getByRole('button', { name: 'Agen sebelumnya' });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title')).toMatch(/Shift\+C/);
    expect(btn.textContent).toContain('Mundur');
  });

  it('TIDAK dirender tanpa prop onCycleAgentBack (kompat — pola onCycleAgent 182)', () => {
    render(<QuickToolbar {...baseProps} onCycleAgent={noop} />);
    expect(screen.queryByRole('button', { name: 'Agen sebelumnya' })).toBeNull();
  });

  it('klik → onCycleAgentBack(true) eksplisit (backward=true = mundur, kontrak Shift+C)', () => {
    const calls = [];
    render(<QuickToolbar {...baseProps} onCycleAgentBack={(b) => calls.push(b)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agen sebelumnya' }));
    expect(calls).toEqual([true]);
  });

  it('ikon IconUserPrev terpasang (svg, keluarga garis 1.75 ikon dock)', () => {
    render(<QuickToolbar {...baseProps} onCycleAgentBack={noop} />);
    const btn = screen.getByRole('button', { name: 'Agen sebelumnya' });
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('IconUserPrev diekspor dan memakai strokeWidth 1.75 (konsisten keluarga dock)', () => {
    expect(typeof IconUserPrev).toBe('function');
    const src = readSrc('src/components/Icons.jsx');
    const fn = src.slice(src.indexOf('export function IconUserPrev'));
    expect(fn).toContain('strokeWidth="1.75"');
  });
});

describe('Kontrak statis wiring tombol mundur (anti-regresi 183)', () => {
  const appSrc = readSrc('src/App.jsx');
  const qtSrc = readSrc('src/components/QuickToolbar.jsx');

  it('prop onCycleAgentBack terpasang di QuickToolbar di App.jsx', () => {
    expect(appSrc).toContain('onCycleAgentBack={(backward) => {');
  });

  it('App delegasi MURNI sceneControls.cycleAgent — tanpa formula indeks inline', () => {
    const i = appSrc.indexOf('onCycleAgentBack=');
    const block = appSrc.slice(i, i + 400);
    expect(block).toContain('s.cycleAgent(backward === true)');
    expect(block).not.toMatch(/nextAgentIndex|%|\+ 1|- 1/); // anti duplikasi formula
  });

  it('tombol mundur ditempatkan setelah tombol Agen (urutan maju→mundur di dock)', () => {
    const next = qtSrc.indexOf('Agen berikutnya');
    const prev = qtSrc.indexOf('Agen sebelumnya');
    expect(next).toBeGreaterThan(-1);
    expect(prev).toBeGreaterThan(next);
  });
});
