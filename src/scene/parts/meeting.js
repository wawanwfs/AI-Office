// Rapat tim WFS Project: peserta duduk di ruang meeting saat jam stand-up dan sprint review.
export const MEETING_WINDOWS = [[600, 630], [840, 870]]; // menit sejak 00:00 (10:00–10:30, 14:00–14:30)
export const isMeetingTime = (minutes) => MEETING_WINDOWS.some(([a, b]) => minutes >= a && minutes <= b);

export function createMeeting(ctx) {
  const { THREE, office, rng, agents, agentData, buildChar, seats, roomZ, onChange } = ctx;
  const attendees = agents.slice(0, seats.length);
  const figures = attendees.map((agent, i) => {
    const fig = buildChar(agent, false);
    fig.scale.setScalar(1.7);
    fig.position.set(seats[i].x, 0, seats[i].z);
    // Baris belakang (z lebih kecil) menghadap +Z ke meja, baris depan menghadap -Z
    fig.rotation.y = seats[i].z < roomZ ? Math.PI : 0;
    fig.visible = false;
    office.add(fig);
    return fig;
  });
  let active = false;

  function begin() {
    active = true;
    onChange && onChange(true);
    figures.forEach((f) => { f.visible = true; });
    agentData.slice(0, seats.length).forEach((ad) => {
      ad.walker.visible = false;
      ad.sittingChar.visible = false;
      ad.state = 'meeting';
    });
  }
  function end() {
    active = false;
    onChange && onChange(false);
    figures.forEach((f) => { f.visible = false; });
    agentData.slice(0, seats.length).forEach((ad) => {
      ad.state = 'sitting';
      ad.sittingChar.visible = true;
      ad.label.position.set(ad.home.x, 2.45, ad.home.z);
      ad.timer = 3 + rng.r(0, 6);
    });
  }

  return {
    figures,
    get active() { return active; },
    update(minutes) {
      const want = isMeetingTime(minutes);
      if (want && !active) begin();
      else if (!want && active) end();
    },
  };
}
