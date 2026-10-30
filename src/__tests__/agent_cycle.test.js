import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextAgentIndex } from '../scene/parts/agent_cycle.js';
import {
  resolveShortcutAction,
  findShortcutByAction,
  KEYBOARD_SHORTCUTS,
  formatShortcutHelpSummary,
} from '../scene/parts/shortcut_spec.js';

// Siklus 181 — shortcut keyboard C/Shift+C: siklus fokus agen (maju/mundur).
// Paritas dgn klik agen via SATU SUMBER focusAgentRoot (goal follow + ring +
// bubble + inspector). Dua kontrak kunci:
//  (1) PANEL CHAT TIDAK dibuka dari siklus (suppressSync): panel itu modal
//      (aria-modal + useModalFlag) → C berikutnya terblokir guard modal.
//  (2) EXCEPTION GUARD: bila satu-satunya "modal" adalah inspector agen hasil
//      siklus sendiri (selectedAgent), C tetap jalan — App mengirim
//      agentCycleBlocked yang MENGECEKOKAN inspector; modal nyata tetap blokir.

const __dir = join(dirname(fileURLToPath(import.meta.url)));
const __root = join(__dir, '../..'); // repo root (src/__tests__/.. = src, lalu ..)
const readSrc = (p) => readFileSync(join(__root, p), 'utf8');

const mkEvent = (key, extra = {}) => ({ key, target: {}, ...extra });

// ── Unit: nextAgentIndex (wrap melingkar, part murni) ────────────────────────
describe('nextAgentIndex — wrap indeks siklus agen', () => {
  it('dari -1 (tanpa seleksi): maju → agen pertama (0)', () => {
    expect(nextAgentIndex(-1, 26, false)).toBe(0);
  });
  it('dari -1 (tanpa seleksi): mundur → agen terakhir (len-1)', () => {
    expect(nextAgentIndex(-1, 26, true)).toBe(25);
  });
  it('tengah: maju +1, mundur −1', () => {
    expect(nextAgentIndex(4, 26, false)).toBe(5);
    expect(nextAgentIndex(4, 26, true)).toBe(3);
  });
  it('agen terakhir: maju wrap → 0', () => {
    expect(nextAgentIndex(25, 26, false)).toBe(0);
  });
  it('agen pertama: mundur wrap → len-1', () => {
    expect(nextAgentIndex(0, 26, true)).toBe(25);
  });
  it('len 1: maju & mundur tetap 0 (satu agen)', () => {
    expect(nextAgentIndex(0, 1, false)).toBe(0);
    expect(nextAgentIndex(0, 1, true)).toBe(0);
  });
  it('anti-poisoning: len 0 / negatif / input korup → -1 tanpa melempar', () => {
    expect(nextAgentIndex(-1, 0, false)).toBe(-1);
    expect(nextAgentIndex(0, -5, false)).toBe(-1);
    expect(nextAgentIndex(NaN, 26, false)).toBe(-1);
    expect(nextAgentIndex(undefined, 26, true)).toBe(-1);
    expect(nextAgentIndex(1.5, 26, false)).toBe(-1);
    expect(nextAgentIndex(0, 26, 'ya')).toBe(1); // backward non-boolean → maju
  });
});

// ── Unit: resolveShortcutAction — tombol C ───────────────────────────────────
describe('resolveShortcutAction — tombol C (siklus agen)', () => {
  it('c → CYCLE_AGENT maju', () => {
    expect(resolveShortcutAction(mkEvent('c'))).toEqual({ type: 'CYCLE_AGENT', backward: false });
  });
  it('C (shift) → CYCLE_AGENT mundur (case-insensitive + shiftKey)', () => {
    expect(resolveShortcutAction(mkEvent('C', { shiftKey: true }))).toEqual({ type: 'CYCLE_AGENT', backward: true });
  });
  it('EXCEPTION GUARD: selectedAgent saja (agentCycleBlocked=false) → C tetap jalan', () => {
    // modalOpen=true karena selectedAgent, tapi agentCycleBlocked=false (inspector
    // sengaja tidak dihitung) → C kedua TIDAK mati — inti kontrak siklus 181.
    expect(resolveShortcutAction(mkEvent('c'), { modalOpen: true, agentCycleBlocked: false }))
      .toEqual({ type: 'CYCLE_AGENT', backward: false });
  });
  it('guard modal nyata: agentCycleBlocked=true → null (task-board/help/dll)', () => {
    expect(resolveShortcutAction(mkEvent('c'), { modalOpen: true, activeModal: 'task_board', agentCycleBlocked: true })).toBe(null);
    expect(resolveShortcutAction(mkEvent('c'), { modalOpen: true, activeModal: 'help', agentCycleBlocked: true })).toBe(null);
    expect(resolveShortcutAction(mkEvent('c'), { modalOpen: true, agentCycleBlocked: true })).toBe(null);
  });
  it('guard mengetik: target input → null', () => {
    expect(resolveShortcutAction({ key: 'c', target: { tagName: 'INPUT' } })).toBe(null);
    expect(resolveShortcutAction({ key: 'c', target: { tagName: 'TEXTAREA' } })).toBe(null);
  });
  it('guard modifier: Ctrl/Meta/Alt+C → null (tidak membajak shortcut browser)', () => {
    expect(resolveShortcutAction(mkEvent('c', { ctrlKey: true }))).toBe(null);
    expect(resolveShortcutAction(mkEvent('c', { metaKey: true }))).toBe(null);
    expect(resolveShortcutAction(mkEvent('c', { altKey: true }))).toBe(null);
  });
  it('tidak ada konflik: satu-satunya entri registry dgn tombol C adalah cycle_agent', () => {
    const uses = KEYBOARD_SHORTCUTS.filter(s => String(s.key) === 'C');
    expect(uses.length).toBe(1);
    expect(uses[0].action).toBe('cycle_agent');
  });
});

// ── Dokumentasi & registry ───────────────────────────────────────────────────
describe('dokumentasi shortcut siklus agen', () => {
  it('entri registry: key C, action cycle_agent, kategori navigasi', () => {
    const s = findShortcutByAction('cycle_agent');
    expect(s).toBeTruthy();
    expect(s.key).toBe('C');
    expect(s.category).toBe('navigasi');
    expect(KEYBOARD_SHORTCUTS.filter(x => x.action === 'cycle_agent').length).toBe(1);
  });
  it('ringkasan bantuan menyebut C = agen berikutnya / Shift+C mundur', () => {
    const sum = formatShortcutHelpSummary();
    expect(sum).toContain('C = agen berikutnya');
    expect(sum).toContain('Shift+C');
  });
});

// ── Kontrak statis wiring (tanpa memuat THREE) ───────────────────────────────
describe('wiring siklus agen — kontrak statis', () => {
  const scene = readSrc('src/scene/OfficeScene.js');
  const app = readSrc('src/App.jsx');
  const hooks = readSrc('src/scene/parts/scene_hooks.js');

  it('scene: cycleAgent SATU SUMBER delegasi focusAgentRoot (tanpa duplikasi formula)', () => {
    expect(scene).toContain('cycleAgent: (backward)');
    expect(scene).toContain('focusAgentRoot(root, { suppressSync: true, rf: 20 })');
    expect(scene).toContain('nextAgentIndex(selectedIdx, agentData.length');
  });
  it('scene: suppressSync menahan pemanggilan __wfsSelectAgent (panel chat modal)', () => {
    expect(scene).toContain('window.__wfsSelectAgent&&!suppressSync');
  });
  it('probe __agentCycle terdaftar SCENE_HOOKS (purge destroy) + delegasi cycleAgent', () => {
    expect(hooks).toContain("'__agentCycle'");
    expect(scene).toContain('window.__agentCycle');
    expect(scene).toContain('sceneControls.cycleAgent(backward)');
  });
  it('App: dispatch CYCLE_AGENT delegasi murni — tidak ada logika inline di handler', () => {
    expect(app).toContain("actType === 'CYCLE_AGENT'");
    expect(app).toContain('s.cycleAgent(action.backward)');
    expect(app).toContain('agentCycleBlocked');
  });
  it('App: agentCycleBlocked TIDAK menghitung selectedAgent (exception inspector)', () => {
    const m = app.match(/const agentCycleBlocked = Boolean\(([\s\S]*?)\)\s*\n/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toContain('selectedAgent');
    expect(m[1]).toContain('anyModalOpen(');
  });
  it('overlay help membaca registry (entri C otomatis tampil di dialog Help)', () => {
    const help = readSrc('src/components/OverlayHelp.jsx');
    expect(help).toContain('KEYBOARD_SHORTCUTS');
  });
});
