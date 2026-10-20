// Gerak karakter WFS Project: state machine berbasis tabel handler.
// State: sitting → walking_out → (talking di tujuan) → walking_back → sitting. Ada juga leaving/offsite.
export function createMotion(ctx) {
  const { rng, agentData, walkDestinations, pickCollab, createBubble } = ctx;
  const WALK = 1.6, EXIT = 2.0, ARRIVE = 0.2, LINE_SEC = 1.8;

  const dist2 = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z; return { dx, dz, d: Math.hypot(dx, dz) }; };

  function stride(ad) {
    const t = performance.now() * 0.01;
    ad.walker.children.forEach((c) => {
      if (!c.userData) return;
      if (c.userData.isLeg) {
        c.position.z = Math.sin(t + c.userData.phase) * 0.08;
        c.rotation.x = Math.cos(t + c.userData.phase) * 0.25; // ayunan kaki ringan (tanpa pivot pinggul, aman dari menembus lantai)
      } else if (c.userData.isArm) {
        c.rotation.x = Math.sin(t + c.userData.phase) * 0.5; // lengan berlawanan fase dgn kaki
      }
    });
    // Bob badan: naik-turun kecil 2x per siklus langkah
    ad.walker.position.y = Math.abs(Math.sin(t)) * 0.035;
  }
  function resetStride(ad) {
    ad.walker.children.forEach((c) => { if (c.userData && c.userData.isLeg) { c.position.z = 0; c.rotation.x = 0; } else if (c.userData && c.userData.isArm) { c.rotation.x = 0; } });
    ad.walker.position.y = 0;
  }
  function follow(ad) { ad.label.position.set(ad.walker.position.x, 2.45, ad.walker.position.z); }
  // ── Batas dunia ──
  // Lantai: BoxGeometry(26, z 20) → ±13 / ±10. Dinding kiri x=-13, belakang z=-10.
  // Pintu masuk kantor (spawm shift) di x=-12, z=8 → walker spawn 0.6 unit di dalam.
  const BOUNDS = { xMin: -12.4, xMax: 12.4, zMin: -9.4, zMax: 9.4 };
  function stepToward(ad, target, speed, delta) {
    const { dx, dz, d } = dist2(ad.walker.position, target);
    if (d < ARRIVE) return true;
    const nx = dx / d, nz = dz / d;
    ad.walker.position.x += nx * speed * delta;
    ad.walker.position.z += nz * speed * delta;
    // hard clamp: tanpa ini agent bisa keluar lantai/dinding (spawn DOOR.x=-12
    // di luar BOUNDS dulu, atau walkTarget acak dekat tepi) — dilihat dari
    // luar kantor tampak menembus dinding kiri.
    if (ad.walker.position.x < BOUNDS.xMin) ad.walker.position.x = BOUNDS.xMin;
    if (ad.walker.position.x > BOUNDS.xMax) ad.walker.position.x = BOUNDS.xMax;
    if (ad.walker.position.z < BOUNDS.zMin) ad.walker.position.z = BOUNDS.zMin;
    if (ad.walker.position.z > BOUNDS.zMax) ad.walker.position.z = BOUNDS.zMax;
    ad.walker.rotation.y = Math.atan2(nx, nz);
    stride(ad);
    return false;
  }

  // Jalan lewat rute (waypoint koridor) — return true saat sampai tujuan akhir
  function stepRoute(ad, speed, delta) {
    // _route null (mis. di-set ulang oleh arrive/sendToLunch/endLunch) → hitung rute koridor
    // dari posisi sekarang; tanpa ini agent jalan GARIS LURUS menembus baris meja.
    if (!ad._route && ad.walkTarget) ad._route = routePath({ x: ad.walker.position.x, z: ad.walker.position.z }, ad.walkTarget);
    const path = ad._route;
    while (path && path.length) {
      if (!stepToward(ad, path[0], speed, delta)) return false;
      path.shift();
    }
    return stepToward(ad, ad.walkTarget, speed, delta);
  }

  // Pilih tujuan: 75% menghampiri rekan satu alur kerja, sisanya jalan-jalan
  function chooseTrip(ad) {
    const col = Math.random() < 0.75 ? pickCollab(ad) : null;
    // Tujuan harus area bebas: bukan di atas meja/kursi agent lain (±0.9) dan bukan zona kafe/counter
    // (z>8 dekat bar stools, x<-7.6 dekat counter CAFÉ) — dulu walkDestinations acak bisa mendarat di meja rekan.
    const freeSpot = (bx, bz) => !seatOccupied({ x: bx, z: bz }, ad) && !(bz > 8 && bx < -7.0) && !(bz > 6.4 && bx < -7.6);
    if (col) {
      ad.collab = col; ad.partner = col.partner; ad._talk = -1;
      window.__collabCount = (window.__collabCount || 0) + 1;
      window.__collabLast = ad.agent.name + '->' + col.partner.agent.name;
      ad.walkTarget = { x: col.partner.home.x + 0.95, z: col.partner.home.z - 0.15 };
      ad.collab.viaRoute = true; // catatan: rute dihitung normal
    } else {
      ad.collab = null; ad.partner = null;
      // cari tujuan jalan-jalan yang bebas (maks 8 percobaan; fallback = koridor depan baris sendiri)
      let bx, bz;
      for (let tries = 0; tries < 8; tries++) {
        const dest = walkDestinations[rng.i(0, walkDestinations.length - 1)];
        bx = dest.x + rng.r(-0.5, 0.5); bz = dest.z + rng.r(-0.5, 0.5);
        if (freeSpot(bx, bz)) break;
      }
      if (!freeSpot(bx, bz)) { bx = ad.home.x; bz = FRONT[Math.min(2, Math.max(0, bandOf(ad.home.z)))]; }
      ad.walkTarget = { x: bx, z: bz };
    }
    ad.walkPause = 0;
    ad._route = routePath({ x: ad.walker.position.x, z: ad.walker.position.z }, ad.walkTarget);
  }

  // ── Routing koridor: hindari menembus meja & kursi ──
  // Baris meja di z=-3 / 1.5 / 6. Koridor depan baris (row-1.15) dan gang antar-baris
  // (z=-0.75 / 3.75) bebas rintangan; semua lintasan lewat sana.
  const FRONT = [-4.15, 0.35, 4.85], GANGS = [-0.75, 3.75];
  const bandOf = (z) => (z < -0.75 ? 0 : z < 3.75 ? 1 : 2);
  function routePath(a, b) {
    const ba = bandOf(a.z), bb = bandOf(b.z), path = [];
    if (ba !== bb) {
      const gz = (Math.max(ba, bb) - Math.min(ba, bb) === 1)
        ? GANGS[Math.min(ba, bb)]
        : (Math.abs(a.z - GANGS[0]) + Math.abs(b.z - GANGS[0]) < Math.abs(a.z - GANGS[1]) + Math.abs(b.z - GANGS[1]) ? GANGS[0] : GANGS[1]);
      // keluar baris asal via koridor depan, turun/naik ke gang di x asal, seberang, masuk koridor depan baris tujuan
      path.push({ x: a.x, z: FRONT[ba] }, { x: a.x, z: gz }, { x: b.x, z: gz }, { x: b.x, z: FRONT[bb] });
    } else if (Math.abs(b.x - a.x) > 2.2) {
      // satu band tapi jauh: lewat koridor depan band agar tidak menembus meja rekan
      const fr = FRONT[ba];
      path.push({ x: a.x, z: fr }, { x: b.x, z: fr });
    }
    return path;
  }

  function converse(ad) {
    const me = ad.walker.position, pr = ad.partner;
    ad.walker.rotation.y = Math.atan2(pr.home.x - me.x, pr.home.z - me.z);
    pr.sittingChar.rotation.y = Math.atan2(me.x - pr.home.x, me.z - pr.home.z);
    const lines = ad.collab.lines, step = Math.floor(ad.walkPause / LINE_SEC);
    if (step !== ad._talk && step < lines.length) {
      ad._talk = step;
      const mine = step % 2 === 0;
      const anchor = mine
        ? { get x(){return me.x}, get z(){return me.z}, y:2.0 }
        : { get x(){return pr.home.x}, get z(){return pr.home.z}, y:2.0 };
      createBubble(anchor.x, 2.6, anchor.z, lines[step], (mine ? ad : pr).agent.hex, anchor);
    }
    if (ad.walkPause > LINE_SEC * lines.length + 1.2) {
      pr.sittingChar.rotation.y = 0;
      ad.collab = null; ad.partner = null;
      ad.state = 'walking_back';
    }
  }
  // Meja terisi: cek jarak posisi target ke semua home agent lain (±0.9 = zona meja+kursi)
  function seatOccupied(t, self) {
    return agentData.some((o) => o !== self && o.state !== 'offsite' && Math.hypot(o.home.x - t.x, o.home.z - t.z) < 0.9);
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
      if (ad.lunch) {
        // Lunch: jalan ke kafe dulu, sampai di sana diam & ngobrol acak
        if (stepRoute(ad, WALK, delta)) {
          ad.walkPause += delta;
          if (Math.random() < delta * 0.12) {
            const lunchAnc={get x(){return ad.walker.position.x},get z(){return ad.walker.position.z},y:2.6};
            createBubble(ad.walker.position.x, 2.6, ad.walker.position.z,
              ['“makan siang dulu”', '“kopi wajib”', '“paket nasi goreng”', '“sesh sore nanti?”'][Math.floor(Math.random() * 4)],
              ad.agent.hex, lunchAnc);
          }
        }
        follow(ad);
        return;
      }
      if (stepRoute(ad, WALK, delta)) {
        ad.walkPause += delta;
        if (ad.collab && ad.partner) converse(ad);
        else if (ad.walkPause > 2 + rng.r(0, 2)) ad.state = 'walking_back';
      }
      follow(ad);
    },
    walking_back(ad, delta) {
      if (ad.resetStride) { ad.resetStride = false; resetStride(ad); } // pose bersih saat muncul di pintu (shift datang)
      if (stepRoute(ad, WALK, delta)) {
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
      stepRoute(ad, EXIT, delta);
      follow(ad);
    },
  };

  return function updateMotion(delta) {
    agentData.forEach((ad) => { const h = handlers[ad.state]; if (h) h(ad, delta); });
  };
}
