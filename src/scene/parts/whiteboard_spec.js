// Spesifikasi Whiteboard Ruang Meeting Kampus WFS PROJECT.
// Modul murni tanpa THREE/DOM agar dapat diuji secara independen.

export const WB_FRAME_W = 2.7;
export const WB_FRAME_H = 1.15;
export const WB_FRAME_D = 0.035;

export const WB_BOARD_W = 2.5;
export const WB_BOARD_H = 1.0;

export const WB_POS_Y = 2.2;
export const WB_DZ_FRAME = -2.55;
export const WB_DZ_BOARD = -2.52;

// Baki spidol & penghapus di bawah whiteboard
export const WB_TRAY = {
  w: 2.4,
  h: 0.02,
  d: 0.08,
  y: 1.625,
  dz: -2.51,
  color: 0x8a9ca6,
};

// Item spidol dan penghapus pada baki whiteboard
export function markerItems(cx = 8, cz = -3) {
  const y = 1.64;
  const z = cz - 2.50;
  return [
    { id: 'marker-black', x: cx - 0.45, y, z, w: 0.12, h: 0.015, d: 0.015, color: 0x1e293b, label: 'Spidol Hitam' },
    { id: 'marker-blue',  x: cx - 0.30, y, z, w: 0.12, h: 0.015, d: 0.015, color: 0x2563eb, label: 'Spidol Biru' },
    { id: 'marker-red',   x: cx - 0.15, y, z, w: 0.12, h: 0.015, d: 0.015, color: 0xef4444, label: 'Spidol Merah' },
    { id: 'marker-green', x: cx,        y, z, w: 0.12, h: 0.015, d: 0.015, color: 0x16a34a, label: 'Spidol Hijau' },
    { id: 'eraser',       x: cx + 0.35, y: y + 0.005, z, w: 0.14, h: 0.025, d: 0.045, color: 0x475569, label: 'Penghapus Papan' },
  ];
}

// Target koordinat kamera saat fokus pada ruang meeting & whiteboard
export function meetingFocusTarget(cx = 8, cz = -3) {
  return {
    x: cx,
    y: 1.85,
    z: cz,
    radius: 12.0,
  };
}

// Tooltip / bubble percakapan deskriptif untuk whiteboard
export function getWhiteboardTooltipText(tasks, isMeetingActive = false) {
  if (isMeetingActive) {
    return 'Ruang Meeting — Rapat Standup / Sprint Review sedang berlangsung';
  }
  if (tasks && Number.isFinite(+tasks.total) && +tasks.total > 0) {
    const done = Math.min(Math.max(0, +tasks.done || 0), +tasks.total);
    const pct = Math.round((done / +tasks.total) * 100);
    return `Ruang Meeting — Whiteboard Agenda Sprint: ${done}/${tasks.total} selesai (${pct}%)`;
  }
  return 'Ruang Meeting — Whiteboard Agenda Sprint WFS Project';
}

// Raycast hit detection helper untuk whiteboard & komponennya
export function isWhiteboardHit(obj, boardMesh, boardFrame) {
  if (!obj) return false;
  if (boardMesh && (obj === boardMesh || obj.id === boardMesh.id)) return true;
  if (boardFrame && (obj === boardFrame || obj.id === boardFrame.id)) return true;
  if (boardFrame && typeof boardFrame.getObjectById === 'function' && boardFrame.getObjectById(obj.id)) return true;
  if (obj.userData && (obj.userData.isWhiteboard || obj.userData.isWhiteboardFrame || obj.userData.isWhiteboardAccessory)) return true;
  return false;
}
