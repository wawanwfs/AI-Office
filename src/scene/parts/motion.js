// Gerak karakter WFS Project: state machine berbasis tabel handler.
// State: sitting → walking_out → (talking di tujuan) → walking_back → sitting. Ada juga leaving/offsite.
import { BOUNDS as B, dist2 as dist2Pure, stepMove } from './motion_math.js';
import { routePath as routePathPure } from './routing.js';
import { collabTarget } from './trip_plan.js';
import { OBSTACLES, inObstacle, seatOccupied } from './obstacles.js';
import { talkStep, isConverseOver, speakerIsVisitor } from './converse_timing.js';
import { floorElevationAt } from './floor_elevation.js';
import {
  WALK_SPEED as WALK, EXIT_SPEED as EXIT, LINE_SEC, COLLAB_OFFSET, DEST_JITTER,
  COLLAB_CHANCE, TRIP_PAUSE_MIN, TRIP_PAUSE_JITTER, SIT_TIMER_MIN, SIT_TIMER_JITTER,
  STRIDE, stridePose, pickDest, fallbackSpot,
} from './trip_plan.js';
export function createMotion(ctx) {
  const { rng, agentData, walkDestinations, pickCollab, createBubble } = ctx;
  const dist2 = (a, b) => dist2Pure(a, b);
  // Lantai: BoxGeometry(26, z 20) → ±13 / ±10. Dinding kiri x=-13, belakang z=-10.
  // Pintu masuk kantor (spawn shift) di x=-12, z=8 → walker spawn 0.6 unit di dalam.
  const BOUNDS = B;
  function stepToward(ad, target, speed, delta) {
    const s = stepMove(ad.walker.position, target, speed, delta);
    ad.walker.position.x = s.x;
    ad.walker.position.z = s.z;
    if (!s.arrived) {
      // Rotasi halus menuju arah jalan (slerp/lerp sudut terpendek), bukan snap mendadak
      let diff = s.rot - ad.walker.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ad.walker.rotation.y += diff * Math.min(1, 14 * delta);
      stride(ad);
    } else {
      ad.walker.rotation.y = s.rot;
    }
    return s.arrived;
  }

  function stride(ad) {
    const t = performance.now() * STRIDE.TIME_SCALE;
    ad.walker.children.forEach((c) => {
      if (!c.userData) return;
      const pose = stridePose(t, c.userData.phase || 0);
      if (c.userData.isLeg) {
        c.position.z = pose.legZ; // ayunan kaki ringan (tanpa pivot pinggul, aman dari menembus lantai)
        c.rotation.x = pose.legRotX;
      } else if (c.userData.isArm) {
        c.rotation.x = pose.armRotX; // lengan berlawanan fase dgn kaki
      }
    });
    // Bob badan: naik-turun kecil 2x per siklus langkah + sway pinggul alami di atas elevasi lantai
    const baseY = floorElevationAt(ad.walker.position.z, ad.walker.position.x);
    ad.walker.position.y = baseY + poseBob(t);
    ad.walker.rotation.z = Math.sin(t) * 0.022;
  }
  const poseBob = (t) => stridePose(t).bob;
  function resetStride(ad) {
    ad.walker.children.forEach((c) => { if (c.userData && c.userData.isLeg) { c.position.z = 0; c.rotation.x = 0; } else if (c.userData && c.userData.isArm) { c.rotation.x = 0; } });
    const deskY = (ad.home && Number.isFinite(ad.home.y)) ? ad.home.y : floorElevationAt(ad.walker.position.z, ad.walker.position.x);
    ad.walker.position.y = deskY;
    ad.walker.rotation.z = 0;
  }
  function follow(ad) {
    const baseY = floorElevationAt(ad.walker.position.z, ad.walker.position.x);
    const u = ad.label.userData || (ad.label.userData = {});
    u.baseY = baseY + 2.45;
    u.baseX = ad.walker.position.x;
    ad.label.position.set(ad.walker.position.x, baseY + 2.45 + (u.antiY || 0), ad.walker.position.z);
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
    const col = Math.random() < COLLAB_CHANCE ? pickCollab(ad) : null;
    // Rintangan & aturan bebas dipindah ke obstacles.js (murni, bisa di-unit-test).
    const freeSpot = (bx, bz) =>
      !inObstacle(bx, bz) && !seatOccupied(bx, bz, agentData, ad.agent) && !(bz > 8 && bx < -7.0) && !(bz > 6.4 && bx < -7.6);
    if (col) {
      ad.collab = col; ad.partner = col.partner; ad._talk = -1;
      window.__collabCount = (window.__collabCount || 0) + 1;
      window.__collabLast = ad.agent.name + '->' + col.partner.agent.name;
      ad.walkTarget = collabTarget(col.partner.home, COLLAB_OFFSET);
      ad.collab.viaRoute = true; // catatan: rute dihitung normal
    } else {
      ad.collab = null; ad.partner = null;
      // cari tujuan jalan-jalan yang bebas (maks 8 percobaan; fallback = koridor depan baris sendiri)
      const spot = pickDest(walkDestinations, rng, freeSpot);
      ad.walkTarget = spot || fallbackSpot(ad.home);
    }
    ad.walkPause = 0;
    ad._route = routePath({ x: ad.walker.position.x, z: ad.walker.position.z }, ad.walkTarget);
  }

  // ── Routing koridor: hindari menembus meja & kursi ──
  // Logika dipindah ke routing.js (murni, bisa di-unit-test): baris meja di
  // z=-3 / 1.5 / 6; koridor depan baris (row-1.15) dan gang antar-baris
  // (z=-0.75 / 3.75) bebas rintangan; semua lintasan lewat sana.
  const routePath = (a, b) => routePathPure(a, b);

  function converse(ad) {
    const me = ad.walker.position, pr = ad.partner;
    ad.walker.rotation.y = Math.atan2(pr.home.x - me.x, pr.home.z - me.z);
    pr.sittingChar.rotation.y = Math.atan2(me.x - pr.home.x, me.z - pr.home.z);
    const lines = ad.collab.lines, step = talkStep(ad.walkPause, LINE_SEC);
    if (step !== ad._talk && step < lines.length) {
      ad._talk = step;
      const mine = speakerIsVisitor(step);
      const myY = floorElevationAt(me.z, me.x);
      const prY = (pr.home && Number.isFinite(pr.home.y)) ? pr.home.y : floorElevationAt(pr.home.z, pr.home.x);
      const anchor = mine
        ? { get x(){return me.x}, get z(){return me.z}, y: myY + 2.6 }
        : { get x(){return pr.home.x}, get z(){return pr.home.z}, y: prY + 2.6 };
      createBubble(anchor.x, anchor.y, anchor.z, lines[step], (mine ? ad : pr).agent.hex, anchor);
    }
    if (isConverseOver(ad.walkPause, lines.length, LINE_SEC)) {
      pr.sittingChar.rotation.y = 0;
      ad.collab = null; ad.partner = null;
      ad.state = 'walking_back';
    }
  }
  // Meja terisi kini di obstacles.js — compat: ad.agent dipakai sebagai identitas self.

  const handlers = {
    sitting(ad, delta) {
      ad.timer -= delta;
      if (ad.timer > 0) return;
      ad.state = 'walking_out';
      ad.sittingChar.visible = false;
      ad.walker.visible = true;
      const startY = (ad.home && Number.isFinite(ad.home.y)) ? ad.home.y : floorElevationAt(ad.home.z);
      ad.walker.position.set(ad.home.x, startY, ad.home.z);
      chooseTrip(ad);
    },
    walking_out(ad, delta) {
      if (ad.lunch) {
        // Lunch: jalan ke kafe dulu, sampai di sana diam & ngobrol acak
        if (stepRoute(ad, WALK, delta)) {
          ad.walkPause += delta;
          if (Math.random() < delta * 0.12) {
            const cafeY = floorElevationAt(ad.walker.position.z, ad.walker.position.x);
            const lunchAnc = { get x(){return ad.walker.position.x}, get z(){return ad.walker.position.z}, y: cafeY + 2.6 };
            createBubble(ad.walker.position.x, cafeY + 2.6, ad.walker.position.z,
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
        else if (ad.walkPause > TRIP_PAUSE_MIN + rng.r(0, TRIP_PAUSE_JITTER)) ad.state = 'walking_back';
      }
      follow(ad);
    },
    walking_back(ad, delta) {
      if (ad.resetStride) { ad.resetStride = false; resetStride(ad); } // pose bersih saat muncul di pintu (shift datang)
      if (stepRoute(ad, WALK, delta)) {
        ad.state = 'sitting';
        ad.walker.visible = false;
        ad.sittingChar.visible = true;
        const deskY = (ad.home && Number.isFinite(ad.home.y)) ? ad.home.y : floorElevationAt(ad.home.z);
        const u = ad.label.userData || (ad.label.userData = {});
        u.baseY = deskY + 2.45; u.baseX = ad.home.x; u.antiY = 0; u.antiX = 0;
        ad.label.position.set(ad.home.x, deskY + 2.45, ad.home.z);
        ad.timer = SIT_TIMER_MIN + rng.r(0, SIT_TIMER_JITTER);
        resetStride(ad);
        return;
      }
      follow(ad);
    },
    leaving(ad, delta) {
      const { d } = dist2(ad.walker.position, ad.walkTarget);
      if (d < 0.5) {
        ad.walker.visible = false; ad.state = 'offsite';
        if (ad.label) ad.label.visible = false;
        const deskY = (ad.home && Number.isFinite(ad.home.y)) ? ad.home.y : floorElevationAt(ad.home.z);
        const u = ad.label.userData || (ad.label.userData = {});
        u.baseY = deskY + 2.45; u.baseX = ad.home.x; u.antiY = 0; u.antiX = 0;
        ad.label.position.set(ad.home.x, deskY + 2.45, ad.home.z);
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
