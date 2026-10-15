// Gerak karakter WFS Project: state machine berbasis tabel handler.
// State: sitting → walking_out → (talking di tujuan) → walking_back → sitting. Ada juga leaving/offsite.
export function createMotion(ctx) {
  const { rng, agentData, walkDestinations, pickCollab, createBubble } = ctx;
  const WALK = 1.6, EXIT = 2.0, ARRIVE = 0.2, LINE_SEC = 1.8;

  const dist2 = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z; return { dx, dz, d: Math.hypot(dx, dz) }; };

  function stride(ad) {
    const t = performance.now() * 0.01;
    ad.walker.children.forEach((c) => { if (c.userData && c.userData.isLeg) c.position.z = Math.sin(t + c.userData.phase) * 0.08; });
  }
  function resetStride(ad) {
    ad.walker.children.forEach((c) => { if (c.userData && c.userData.isLeg) c.position.z = 0; });
  }
  function follow(ad) { ad.label.position.set(ad.walker.position.x, 2.45, ad.walker.position.z); }
  function stepToward(ad, target, speed, delta) {
    const { dx, dz, d } = dist2(ad.walker.position, target);
    if (d < ARRIVE) return true;
    const nx = dx / d, nz = dz / d;
    ad.walker.position.x += nx * speed * delta;
    ad.walker.position.z += nz * speed * delta;
    ad.walker.rotation.y = Math.atan2(nx, nz);
    stride(ad);
    return false;
  }

  // Pilih tujuan: 75% menghampiri rekan satu alur kerja, sisanya jalan-jalan
  function chooseTrip(ad) {
    const col = Math.random() < 0.75 ? pickCollab(ad) : null;
    if (col) {
      ad.collab = col; ad.partner = col.partner; ad._talk = -1;
      window.__collabCount = (window.__collabCount || 0) + 1;
      window.__collabLast = ad.agent.name + '->' + col.partner.agent.name;
      ad.walkTarget = { x: col.partner.home.x + 0.95, z: col.partner.home.z - 0.15 };
    } else {
      ad.collab = null; ad.partner = null;
      const dest = walkDestinations[rng.i(0, walkDestinations.length - 1)];
      ad.walkTarget = { x: dest.x + rng.r(-0.5, 0.5), z: dest.z + rng.r(-0.5, 0.5) };
    }
    ad.walkPause = 0;
  }

  function converse(ad) {
    const me = ad.walker.position, pr = ad.partner;
    ad.walker.rotation.y = Math.atan2(pr.home.x - me.x, pr.home.z - me.z);
    pr.sittingChar.rotation.y = Math.atan2(me.x - pr.home.x, me.z - pr.home.z);
    const lines = ad.collab.lines, step = Math.floor(ad.walkPause / LINE_SEC);
    if (step !== ad._talk && step < lines.length) {
      ad._talk = step;
      const mine = step % 2 === 0;
      const at = mine ? me : { x: pr.home.x, z: pr.home.z };
      createBubble(at.x, 2.6, at.z, lines[step], (mine ? ad : pr).agent.hex);
    }
    if (ad.walkPause > LINE_SEC * lines.length + 1.2) {
      pr.sittingChar.rotation.y = 0;
      ad.collab = null; ad.partner = null;
      ad.state = 'walking_back';
    }
  }

  const handlers = {
    sitting(ad, delta) {
      ad.timer -= delta;
      if (ad.timer > 0) return;
      ad.state = 'walking_out';
      ad.sittingChar.visible = false;
      ad.walker.visible = true;
      ad.walker.position.set(ad.home.x, 0, ad.home.z);
      chooseTrip(ad);
    },
    walking_out(ad, delta) {
      if (stepToward(ad, ad.walkTarget, WALK, delta)) {
        ad.walkPause += delta;
        if (ad.collab && ad.partner) converse(ad);
        else if (ad.walkPause > 2 + rng.r(0, 2)) ad.state = 'walking_back';
      }
      follow(ad);
    },
    walking_back(ad, delta) {
      if (stepToward(ad, ad.home, WALK, delta)) {
        ad.state = 'sitting';
        ad.walker.visible = false;
        ad.sittingChar.visible = true;
        ad.label.position.set(ad.home.x, 2.45, ad.home.z);
        ad.timer = 6 + rng.r(0, 14);
        resetStride(ad);
        return;
      }
      follow(ad);
    },
    leaving(ad, delta) {
      const { d } = dist2(ad.walker.position, ad.walkTarget);
      if (d < 0.5) {
        ad.walker.visible = false; ad.state = 'offsite';
        ad.label.position.set(ad.home.x, 2.45, ad.home.z);
        return;
      }
      stepToward(ad, ad.walkTarget, EXIT, delta);
      follow(ad);
    },
  };

  return function updateMotion(delta) {
    agentData.forEach((ad) => { const h = handlers[ad.state]; if (h) h(ad, delta); });
  };
}
