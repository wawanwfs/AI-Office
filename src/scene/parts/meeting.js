// Rapat tim WFS Project: peserta duduk di ruang meeting saat jam stand-up dan sprint review.
// Peserta bergilir per window (hash indeks window), label agent ikut pindah ke ruang meeting.
export const MEETING_WINDOWS = [[600, 630], [840, 870]]; // menit sejak 00:00 (10:00–10:30, 14:00–14:30)
export const isMeetingTime = (minutes) => MEETING_WINDOWS.some(([a, b]) => minutes >= a && minutes <= b);
export const meetingWindowIndex = (minutes) => MEETING_WINDOWS.findIndex(([a, b]) => minutes >= a && minutes <= b);

export function createMeeting(ctx) {
  const { THREE, office, rng, agents, agentData, buildChar, seats, roomZ, onChange, LABEL_Y } = ctx;
  // Figur dibuat untuk semua agent; hanya peserta window aktif yang tampil di kursi.
  const figures = agents.map((agent) => {
    const fig = buildChar(agent, false);
    fig.scale.setScalar(1.7);
    fig.visible = false;
    office.add(fig);
    return fig;
  });
  let active = false;
  let currentIdx = []; // indeks agent yang sedang rapat
  let lastWin = -1;

  // Rotasi peserta deterministik per window: mulai dari hash window, ambil seats.length agent
  function pickAttendees(win) {
    const n = seats.length;
    const start = (win * 7 + 3) % agents.length;
    const idx = [];
    for (let k = 0; k < n && k < agents.length; k++) idx.push((start + k) % agents.length);
    return idx;
  }

  function placeFigure(fig, seat) {
    fig.position.set(seat.x, 0, seat.z);
    // Baris belakang (z lebih kecil) menghadap +Z ke meja, baris depan menghadap -Z
    fig.rotation.y = seat.z < roomZ ? Math.PI : 0;
  }

  function begin(minutes) {
    active = true;
    const win = Math.max(0, meetingWindowIndex(minutes));
    lastWin = win; // BUGFIX: dulu lastWin tidak pernah di-set di begin() → kondisi
    // `win !== lastWin` di update() selalu true saat rapat aktif → end()+begin()
    // dieksekusi SETIAP FRAME (~1799× dalam satu window 30 menit @60fps):
    // label peserta flip posisi tiap frame, onChange(true) spam, timer agent reset terus.
    currentIdx = pickAttendees(win);
    onChange && onChange(true);
    figures.forEach((f) => { f.visible = false; });
    currentIdx.forEach((ai, i) => {
      const seat = seats[i % seats.length];
      placeFigure(figures[ai], seat);
      figures[ai].visible = true;
      const ad = agentData[ai];
      if (!ad) return;
      ad.walker.visible = false;
      ad.sittingChar.visible = false;
      ad.state = 'meeting';
      // Label pindah mengambang di atas kursi rapat
      if (ad.label) ad.label.position.set(seat.x, (LABEL_Y || 2.45) + 0.6, seat.z + 0.55);
    });
  }
  function end() {
    active = false;
    lastWin = -1; // reset supaya window yang sama bisa begin() lagi setelah end
    onChange && onChange(false);
    figures.forEach((f) => { f.visible = false; });
    currentIdx.forEach((ai) => {
      const ad = agentData[ai];
      if (!ad) return;
      ad.state = 'sitting';
      ad.sittingChar.visible = true;
      if (ad.label) ad.label.position.set(ad.home.x, LABEL_Y || 2.45, ad.home.z);
      ad.timer = 3 + rng.r(0, 6);
    });
    currentIdx = [];
  }

  return {
    figures,
    attendees: () => currentIdx.slice(),
    get active() { return active; },
    update(minutes) {
      const want = isMeetingTime(minutes);
      const win = meetingWindowIndex(minutes);
      if (want && !active) begin(minutes);
      else if (want && active && win !== lastWin) { end(); begin(minutes); } // ganti window -> peserta baru
      else if (!want && active) end();
    },
  };
}
