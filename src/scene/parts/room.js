import { ROOM_CX, ROOM_CZ, meetingSeats, glassPanels, framePosts } from './meeting_room_spec.js';
import { TICKS, tickAngle, tickInnerR, hourHandAngle, minuteHandAngle, secondHandAngle, HANDS } from './clock_spec.js';
import { drawSprintBoard } from './whiteboard_canvas.js';

// Ruang meeting, jam dinding, dan pencahayaan gantung — ditulis ulang untuk WFS Project.
export function createMeetingRoom(ctx, glassMat) {
  const { THREE, office, M } = ctx;
  const CX = ROOM_CX, CZ = ROOM_CZ;           // pusat ruangan
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); office.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // Kaca pembatas: sisi kiri + dua panel depan dengan celah pintu
  for (const p of glassPanels(CX, CZ)) put(B(p.w, p.h, p.d), glassMat, p.x, p.h / 2, p.z);
  // Tiang rangka
  for (const p of framePosts(CX, CZ)) put(B(0.05, 3.5, 0.05), M(0x8fa1b4), p.x, 1.75, p.z);

  // Meja rapat oval-ish: papan + dua kaki panel
  const top = put(B(3.9, 0.07, 1.55), M(0xe7ecf1), CX, 0.72, CZ);
  top.castShadow = top.receiveShadow = true;
  [-1.55, 1.55].forEach((dx) => put(B(0.08, 0.7, 1.1), M(0xa9bccd), CX + dx, 0.35, CZ));

  // Kursi (3 per sisi)
  const seats = meetingSeats(CX, CZ);
  seats.forEach((s) => {
    put(B(0.36, 0.045, 0.36), M(0x3a4a54), s.x, 0.42, s.z);
    put(B(0.36, 0.34, 0.045), M(0x3a4a54), s.x, 0.61, s.z + (s.ry === 0 ? -0.19 : 0.19));
    put(B(0.045, 0.4, 0.045), M(0x8a9ca6), s.x, 0.2, s.z);
  });

  // Whiteboard dengan agenda sprint
  put(B(2.7, 1.15, 0.035), M(0xbfc5ca), CX, 2.2, CZ - 2.55);
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 128;
  const g = cv.getContext('2d');
  drawSprintBoard(g);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
  board.position.set(CX, 2.2, CZ - 2.52);
  office.add(board);

  return { MRX: CX, MRZ: CZ, meetSeats: seats };
}

export function createWallClock(ctx, x, y, z, faceRotY = Math.PI) {
  const { THREE, office, M } = ctx;
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96;
  const c = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), M(0x2a2f36));
  rim.rotation.x = Math.PI / 2; rim.position.set(x, y, z + (faceRotY ? 0.03 : -0.03)); office.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(x, y, z); face.rotation.y = faceRotY; office.add(face);

  const draw = (nowSeconds, dateMs = Date.now()) => {
    const minutes = nowSeconds / 60;
    const cx = 48, cy = 48;
    c.fillStyle = '#fafafa'; c.fillRect(0, 0, 96, 96);
    c.strokeStyle = '#2a2f36'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 45, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < TICKS; i++) {
      const a = tickAngle(i);
      const r1 = tickInnerR(i);
      c.beginPath(); c.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
      c.lineTo(cx + Math.sin(a) * 43, cy - Math.cos(a) * 43); c.stroke();
    }
    const hand = (angle, len, w, col) => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.sin(angle) * len, cy - Math.cos(angle) * len); c.stroke();
    };
    hand(hourHandAngle(minutes), HANDS.hour.len, HANDS.hour.w, HANDS.hour.color);
    hand(minuteHandAngle(minutes), HANDS.minute.len, HANDS.minute.w, HANDS.minute.color);
    hand(secondHandAngle(((dateMs / 1000) % 60)), HANDS.second.len, HANDS.second.w, HANDS.second.color);
    c.fillStyle = '#f97316'; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
    tex.needsUpdate = true;
  };
  return { draw, tex };
}

export function createCeilingFixtures(ctx, deskList) {
  const { THREE, office, M, MB } = ctx;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); office.add(m); return m; };
  // Lampu gantung industri di atas tiap meja
  deskList.forEach((d) => {
    put(B(0.02, 0.8, 0.02), M(0x2e3238), d.x, 3.65, d.z);
    put(B(0.4, 0.14, 0.4), M(0x22262b), d.x, 3.2, d.z);
    put(B(0.12, 0.06, 0.12), MB(0xfff3d6), d.x, 3.11, d.z);
    const pl = new THREE.PointLight(0xffe8cc, 0.15, 4, 2); pl.position.set(d.x, 3.1, d.z); office.add(pl);
  });
}
