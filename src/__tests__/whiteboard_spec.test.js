import { describe, it, expect } from 'vitest';
import {
  WB_FRAME_W,
  WB_FRAME_H,
  WB_FRAME_D,
  WB_BOARD_W,
  WB_BOARD_H,
  WB_POS_Y,
  WB_DZ_FRAME,
  WB_DZ_BOARD,
  WB_TRAY,
  markerItems,
  meetingFocusTarget,
  getWhiteboardTooltipText,
  isWhiteboardHit,
} from '../scene/parts/whiteboard_spec.js';

describe('whiteboard_spec — konstanta geometri & layout', () => {
  it('mengekspor dimensi dan posisi whiteboard baku', () => {
    expect(WB_FRAME_W).toBe(2.7);
    expect(WB_FRAME_H).toBe(1.15);
    expect(WB_FRAME_D).toBe(0.035);
    expect(WB_BOARD_W).toBe(2.5);
    expect(WB_BOARD_H).toBe(1.0);
    expect(WB_POS_Y).toBe(2.2);
    expect(WB_DZ_FRAME).toBe(-2.55);
    expect(WB_DZ_BOARD).toBe(-2.52);
  });

  it('mengekspor spesifikasi baki spidol (WB_TRAY)', () => {
    expect(WB_TRAY.w).toBe(2.4);
    expect(WB_TRAY.h).toBe(0.02);
    expect(WB_TRAY.d).toBe(0.08);
    expect(WB_TRAY.y).toBe(1.625);
    expect(WB_TRAY.dz).toBe(-2.51);
    expect(WB_TRAY.color).toBe(0x8a9ca6);
  });
});

describe('whiteboard_spec — markerItems', () => {
  it('menghasilkan 4 spidol berwarna dan 1 penghapus papan', () => {
    const items = markerItems(8, -3);
    expect(items).toHaveLength(5);

    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['marker-black', 'marker-blue', 'marker-red', 'marker-green', 'eraser']);

    const black = items.find((i) => i.id === 'marker-black');
    expect(black.color).toBe(0x1e293b);
    expect(black.z).toBe(-3 - 2.50);

    const eraser = items.find((i) => i.id === 'eraser');
    expect(eraser.color).toBe(0x475569);
    expect(eraser.w).toBe(0.14);
  });

  it('menghormati custom pusat ruangan (cx, cz)', () => {
    const items = markerItems(20, 10);
    expect(items[0].x).toBeCloseTo(20 - 0.45);
    expect(items[0].z).toBeCloseTo(10 - 2.50);
  });
});

describe('whiteboard_spec — meetingFocusTarget', () => {
  it('mengembalikan target kamera fokus ruang meeting', () => {
    const target = meetingFocusTarget(8, -3);
    expect(target).toEqual({
      x: 8,
      y: 1.85,
      z: -3,
      radius: 12.0,
    });
  });
});

describe('whiteboard_spec — getWhiteboardTooltipText', () => {
  it('mengembalikan teks khusus saat rapat aktif', () => {
    const text = getWhiteboardTooltipText({ total: 10, done: 5 }, true);
    expect(text).toBe('Ruang Meeting — Rapat Standup / Sprint Review sedang berlangsung');
  });

  it('mengembalikan status task & persentase saat data live tersedia', () => {
    const text = getWhiteboardTooltipText({ total: 6, done: 4 }, false);
    expect(text).toBe('Ruang Meeting — Whiteboard Agenda Sprint: 4/6 selesai (67%)');
  });

  it('clamp nilai done agar tidak melebihi total', () => {
    const text = getWhiteboardTooltipText({ total: 10, done: 15 }, false);
    expect(text).toBe('Ruang Meeting — Whiteboard Agenda Sprint: 10/10 selesai (100%)');
  });

  it('fallback elegan saat data tasks null atau kosong', () => {
    expect(getWhiteboardTooltipText(null, false)).toBe('Ruang Meeting — Whiteboard Agenda Sprint WFS Project');
    expect(getWhiteboardTooltipText({}, false)).toBe('Ruang Meeting — Whiteboard Agenda Sprint WFS Project');
  });
});

describe('whiteboard_spec — isWhiteboardHit', () => {
  const mesh = { id: 101 };
  const frame = { id: 102, getObjectById: (id) => (id === 103 ? { id: 103 } : null) };

  it('mendeteksi hit pada mesh papan atau frame', () => {
    expect(isWhiteboardHit(mesh, mesh, frame)).toBe(true);
    expect(isWhiteboardHit(frame, mesh, frame)).toBe(true);
    expect(isWhiteboardHit({ id: 101 }, mesh, frame)).toBe(true);
  });

  it('mendeteksi hit pada child object frame', () => {
    expect(isWhiteboardHit({ id: 103 }, mesh, frame)).toBe(true);
  });

  it('mendeteksi hit via userData tanda whiteboard', () => {
    expect(isWhiteboardHit({ userData: { isWhiteboard: true } }, mesh, frame)).toBe(true);
    expect(isWhiteboardHit({ userData: { isWhiteboardFrame: true } }, mesh, frame)).toBe(true);
    expect(isWhiteboardHit({ userData: { isWhiteboardAccessory: true } }, mesh, frame)).toBe(true);
  });

  it('mengembalikan false untuk objek non-whiteboard atau null', () => {
    expect(isWhiteboardHit(null, mesh, frame)).toBe(false);
    expect(isWhiteboardHit({ id: 999, userData: {} }, mesh, frame)).toBe(false);
  });
});
