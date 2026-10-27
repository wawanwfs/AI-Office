import { describe, it, expect } from 'vitest';
import { collectPickTargets, findMeetingFigureOwner } from '../scene/parts/raycast_targets.js';
import { meetingFigureAnchor } from '../scene/parts/ring_spec.js';

const node = (name, extra = {}) => ({ id: name, name, parent: null, visible: true, ...extra });

describe('collectPickTargets — meetingFigures (siklus 119)', () => {
  it('figur tampil disertakan setelah nexus; figur tersembunyi & null dikecualikan', () => {
    const f1 = node('f1', { visible: true });
    const f2 = node('f2', { visible: false });
    const nx = node('nx');
    const out = collectPickTargets({
      agentData: [], nexus: nx, meetingFigures: [f1, f2, null],
    });
    expect(out).toEqual([nx, f1]);
  });

  it('meetingFigures tak disediakan / bukan array / array kosong → perilaku lama utuh', () => {
    const nx = node('nx');
    expect(collectPickTargets({ nexus: nx })).toEqual([nx]);
    expect(collectPickTargets({ nexus: nx, meetingFigures: undefined })).toEqual([nx]);
    expect(collectPickTargets({ nexus: nx, meetingFigures: 'nope' })).toEqual([nx]);
    expect(collectPickTargets({ nexus: nx, meetingFigures: [] })).toEqual([nx]);
  });

  it('urutan lengkap tak berubah: agen → board → whiteboard → nexus → figur rapat', () => {
    const sit = node('sit'), walk = node('walk'), bm = node('bm'), bf = node('bf'),
      wm = node('wm'), wf = node('wf'), nx = node('nx'), f1 = node('f1');
    const out = collectPickTargets({
      agentData: [{ sittingChar: sit, walker: walk }],
      board: { mesh: bm, frame: bf },
      whiteboard: { mesh: wm, frame: wf },
      nexus: nx,
      meetingFigures: [f1],
    });
    expect(out).toEqual([sit, walk, bm, bf, wm, wf, nx, f1]);
  });
});

describe('findMeetingFigureOwner (siklus 119)', () => {
  it('hit langsung pada figur → {index, figure} sesuai urutan agentData', () => {
    const f0 = node('f0'), f1 = node('f1'), f2 = node('f2');
    expect(findMeetingFigureOwner(f1, [f0, f1, f2])).toEqual({ index: 1, figure: f1 });
    expect(findMeetingFigureOwner(f0, [f0, f1, f2])).toEqual({ index: 0, figure: f0 });
  });

  it('hit pada anakan (torso/lengan) → naik rantai parent ke figur', () => {
    const fig = node('fig');
    const child = node('torso', { parent: fig });
    const grand = node('arm', { parent: child });
    expect(findMeetingFigureOwner(grand, [fig])).toEqual({ index: 0, figure: fig });
  });

  it('objek asing/agen biasa → null (tak salah memetakan ke figur)', () => {
    const fig = node('fig');
    const sit = node('sit');
    expect(findMeetingFigureOwner(sit, [fig])).toBe(null);
    expect(findMeetingFigureOwner(node('stranger'), [fig])).toBe(null);
    expect(findMeetingFigureOwner(null, [fig])).toBe(null);
    expect(findMeetingFigureOwner(sit, null)).toBe(null);
    expect(findMeetingFigureOwner(sit, [])).toBe(null);
  });
});

describe('meetingFigureAnchor (siklus 119)', () => {
  it('anchor = posisi figur (kursi rapat) + off 0', () => {
    const fig = { visible: true, position: { x: 9.4, y: 0.04, z: -4.1 } };
    expect(meetingFigureAnchor(fig)).toEqual({ x: 9.4, y: 0.04, z: -4.1, off: 0 });
  });

  it('y non-finite → 0 (null-safe)', () => {
    const fig = { visible: true, position: { x: 1, y: NaN, z: 2 } };
    expect(meetingFigureAnchor(fig)).toEqual({ x: 1, y: 0, z: 2, off: 0 });
  });

  it('figur null / tersembunyi / tanpa position → null (ring disembunyikan)', () => {
    expect(meetingFigureAnchor(null)).toBe(null);
    expect(meetingFigureAnchor({ visible: false, position: { x: 1, y: 0, z: 2 } })).toBe(null);
    expect(meetingFigureAnchor({ visible: true })).toBe(null);
  });
});
