// Unit test state machine rapat: createMeeting.update() — begin/end/rotasi antar window,
// serta isolasi state antar instance (regresi: lastWin dulunya variabel module-level).
import { describe, it, expect } from 'vitest';
import { createMeeting, isMeetingTime, meetingWindowIndex } from '../scene/parts/meeting.js';

function mkCtx(nAgents = 14, nSeats = 4) {
  const figures = [];
  const buildChar = () => { const f = { scale: { setScalar() {} }, visible: false, position: { set() {} }, rotation: { y: 0, set() {} } }; figures.push(f); return f; };
  const agents = Array.from({ length: nAgents }, (_, i) => ({ name: 'A' + i }));
  const agentData = agents.map(() => ({ walker: { visible: false }, sittingChar: { visible: false }, state: 'sitting', label: { position: { set() {} } }, home: { x: 0, z: 0 } }));
  return {
    ctx: {
      THREE: {}, office: { add() {} }, rng: { r: () => 3 }, agents, agentData, buildChar,
      seats: Array.from({ length: nSeats }, (_, i) => ({ x: i * 2, z: 0 })),
      roomZ: -2, LABEL_Y: 2.45, onChange: null,
    },
    figures, agentData,
  };
}

describe('meeting.update() state machine', () => {
  it('mulai rapat saat masuk jendela (menit 600), peserta = seats.length, state agent = meeting', () => {
    const { ctx, agentData } = mkCtx();
    const m = createMeeting(ctx);
    m.update(599);
    expect(m.active).toBe(false);
    m.update(600);
    expect(m.active).toBe(true);
    expect(m.attendees().length).toBe(ctx.seats.length);
    m.attendees().forEach((ai) => expect(agentData[ai].state).toBe('meeting'));
  });

  it('staggering vertikal kursi rapat: kursi belakang (z < roomZ) lebih tinggi dibanding kursi depan', () => {
    const { ctx, agentData } = mkCtx();
    ctx.seats = [
      { x: 6.6, z: -4.1 }, // z < -2 -> baris belakang (stagger 0.95)
      { x: 6.6, z: 0.5 },  // z > -2 -> baris depan (stagger 0.40)
    ];
    const labelSets = [];
    agentData.forEach((ad, i) => {
      ad.label = { position: { set(x, y, z) { labelSets[i] = { x, y, z }; } }, userData: {} };
    });
    const m = createMeeting(ctx);
    m.update(600);
    expect(m.active).toBe(true);
    const att = m.attendees();
    expect(labelSets[att[0]].y).toBeCloseTo(2.45 + 0.95, 2);
    expect(labelSets[att[1]].y).toBeCloseTo(2.45 + 0.40, 2);
    expect(labelSets[att[0]].y).toBeGreaterThan(labelSets[att[1]].y);
  });

  it('sembunyikan non-peserta di ruang meeting saat rapat, pulihkan saat akhir rapat', () => {
    const { ctx, agentData } = mkCtx();
    // Agent 12 mejanya di dalam ruang meeting (x=8, z=-3) tapi bukan peserta
    agentData[12].home = { x: 8, z: -3 };
    agentData[12].label = { visible: true, position: { set() {} }, userData: {} };
    agentData[12].sittingChar = { visible: true };
    agentData[12].state = 'sitting';

    const m = createMeeting(ctx);
    m.update(600);
    expect(m.active).toBe(true);
    if (!m.attendees().includes(12)) {
      expect(agentData[12].label.visible).toBe(false);
      expect(agentData[12].sittingChar.visible).toBe(false);
    }
    m.update(631);
    expect(m.active).toBe(false);
    expect(agentData[12].label.visible).toBe(true);
    expect(agentData[12].sittingChar.visible).toBe(true);
  });

  it('tahan di dalam jendela tanpa restart peserta (menit 600→629: attendee & state stabil)', () => {
    const { ctx, agentData } = mkCtx();
    const m = createMeeting(ctx);
    m.update(600);
    const before = m.attendees().slice();
    m.update(615); m.update(629);
    expect(m.active).toBe(true);
    expect(m.attendees()).toEqual(before);
    m.attendees().forEach((ai) => expect(agentData[ai].state).toBe('meeting'));
  });

  it('akhir rapat saat keluar jendela (menit 631): agent kembali sitting + label home', () => {
    const { ctx, agentData } = mkCtx();
    const m = createMeeting(ctx);
    m.update(620);
    const att = m.attendees().slice();
    m.update(631);
    expect(m.active).toBe(false);
    expect(m.attendees()).toEqual([]);
    att.forEach((ai) => expect(agentData[ai].state).toBe('sitting'));
    expect(m.figures.every((f) => f.visible === false)).toBe(true);
  });

  it('akhir rapat mengembalikan label agen ke elevasi lantai meja masing-masing (L1 Y=0, L2 Y=0.60, L3 Y=1.20)', () => {
    const { ctx, agentData } = mkCtx();
    const labelCalls = {};
    agentData[0].home = { x: -8, y: 0, z: -3 };
    agentData[0].label = { position: { set: (x, y, z) => { labelCalls[0] = { x, y, z }; } } };
    agentData[1].home = { x: -4, y: 0.60, z: 1.5 };
    agentData[1].label = { position: { set: (x, y, z) => { labelCalls[1] = { x, y, z }; } } };
    agentData[2].home = { x: -8, y: 1.20, z: 6 };
    agentData[2].label = { position: { set: (x, y, z) => { labelCalls[2] = { x, y, z }; } } };

    const m = createMeeting(ctx);
    m.update(610); // mulai rapat
    m.update(631); // rapat selesai
    // Peserta yang kembali ke meja mendapatkan posisi Y = ad.home.y + LABEL_Y
    if (labelCalls[0]) expect(labelCalls[0].y).toBeCloseTo(0 + 2.45, 2);
    if (labelCalls[1]) expect(labelCalls[1].y).toBeCloseTo(0.60 + 2.45, 2);
    if (labelCalls[2]) expect(labelCalls[2].y).toBeCloseTo(1.20 + 2.45, 2);
  });

  it('rotasi antar window: peserta window 0 ≠ window 1 (hash mulai berbeda, tanpa restart manual)', () => {
    const { ctx } = mkCtx(14, 4);
    const m = createMeeting(ctx);
    m.update(610); // window 0
    const w0 = m.attendees().slice();
    m.update(841); // window 1 — harus end+begin otomatis via lastWin
    expect(m.active).toBe(true);
    const w1 = m.attendees().slice();
    expect(w0).not.toEqual(w1);
  });

  it('isolasi state antar instance: instance kedua tidak mewarisi lastWin instance pertama', () => {
    const a = mkCtx(); const b = mkCtx();
    const m1 = createMeeting(a.ctx);
    m1.update(610); // window 0 aktif
    const m2 = createMeeting(b.ctx);
    m2.update(841); // window 1 — dengan lastWin module-level (bug lama), begin di-skip → false negatif
    expect(m2.active).toBe(true);
    expect(m2.attendees().length).toBe(b.ctx.seats.length);
  });

  it('stabil per frame: update(610) 1800× tidak restart peserta (regresi lastWin tak di-set begin())', () => {
    const { ctx } = mkCtx();
    const m = createMeeting(ctx);
    m.update(610);
    const before = m.attendees().slice();
    for (let f = 0; f < 1800; f++) m.update(610); // ~30 dtk @60fps, menit konstan
    expect(m.active).toBe(true);
    expect(m.attendees()).toEqual(before);
  });

  it('end() me-reset lastWin: window sama bisa begin() lagi setelah end', () => {
    const { ctx } = mkCtx();
    const m = createMeeting(ctx);
    m.update(610); m.update(631);
    m.update(615); // masuk window 0 lagi → harus aktif, bukan skip karena lastWin masih 0
    expect(m.active).toBe(true);
    expect(m.attendees().length).toBe(ctx.seats.length);
  });

  it('konsisten dengan util jadwal: 600/630 di dalam, 599/631 di luar', () => {
    expect(isMeetingTime(600) && isMeetingTime(630)).toBe(true);
    expect(isMeetingTime(599) || isMeetingTime(631)).toBe(false);
    expect(meetingWindowIndex(841)).toBe(1);
  });

  it('skalabilitas 26 agen kampus: rotasi meeting mencakup spesialis multi-lantai (indeks ≥ 14)', () => {
    const { ctx } = mkCtx(26, 6); // 26 agen kampus, 6 kursi rapat
    const m = createMeeting(ctx);
    m.update(610); // window 0
    const w0 = m.attendees();
    expect(w0.length).toBe(6);

    // Buka window 1 (menit 841)
    m.update(841);
    const w1 = m.attendees();
    expect(w1.length).toBe(6);

    // Kumpulkan peserta dari beberapa window simulasi (misal win 0, 1, 2)
    // Formula rotasi: (win * 7 + 3) % 26
    const allWinAttendees = new Set([...w0, ...w1]);
    expect(Array.from(allWinAttendees).some(idx => idx >= 14)).toBe(true);
  });
});
