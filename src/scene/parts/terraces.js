import { drawTerrazzo } from './floor_canvas.js';
// parts/terraces.js — Arsitektur Gedung Bertingkat 3 Lantai Nyata (Cascading High-Rise Headquarter Terraces)
// Posisi lantai bertingkat alami dari depan ke belakang (Lantai 1: Y=0, Lantai 2: Y=0.60, Lantai 3: Y=1.20),
// tangga arsitektural naik, tekstur prosedural marmer Carrara & parket jati mewah tanpa z-fighting/flicker.
import { L1_Y, L2_Y, L3_Y, floorElevationAt } from './floor_elevation.js';
export { L1_Y, L2_Y, L3_Y, floorElevationAt };

export function createTerraces({ THREE, office, M, MB }) {
  const terraces = new THREE.Group();

  // Koleksi lampu & strip LED untuk sinkronisasi mode Gelap / Terang
  const stepStrips = [];
  const ledLines = [];

  // Material Kaca Balustrade Transparan & Mewah
  const GlassRail = () => new THREE.MeshPhysicalMaterial({
    color: 0xCCE8FF,
    transparent: true,
    opacity: 0.25,
    roughness: 0.04,
    transmission: 0.92,
    thickness: 0.35,
  });

  // Helper Pembuat Plakat Lantai Beriluminasi
  const createFloorBadge = (text, levelText, accentColor) => {
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 112;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(6, 12, 26, 0.94)';
      ctx.roundRect ? ctx.roundRect(4, 4, 632, 104, 16) : ctx.rect(4, 4, 632, 104);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.font = 'bold 24px "DM Mono", monospace';
      ctx.fillText(levelText, 28, 42);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px "DM Sans", sans-serif';
      ctx.fillText(text, 28, 82);
    }
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 0.74),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // terazzo prosedural per deck — painter murni di floor_canvas.js (diuji unit)
  const terrazzoMat = (tint, rx, ry) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    drawTerrazzo(cv.getContext('2d'), tint);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.repeat.set(rx, ry);
    return new THREE.MeshLambertMaterial({ color: 0xFFFFFF, map: t });
  };

  // ══════════════════════════════════════════════════════════
  // LANTAI 1 (Level 01 — Ground Level / Depan Kamera, Z ∈ [-14, -0.8], Y = 0)
  // ══════════════════════════════════════════════════════════
  const l1Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, 0.20, 13.0),
    terrazzoMat('#FFFFFF', 3.2, 1.5) // Terazzo putih bervena
  );
  l1Deck.position.set(0, -0.10, -7.4);
  l1Deck.receiveShadow = true;
  terraces.add(l1Deck);

  // Inlay lis emas elegan di Lantai 1
  const l1Inlay = new THREE.Mesh(
    new THREE.BoxGeometry(33.8, 0.015, 0.08),
    M(0xD4AF37)
  );
  l1Inlay.position.set(0, 0.01, -13.0);
  terraces.add(l1Inlay);

  // Plakat Lantai 1 (Paling bawah layar)
  const badgeL1 = createFloorBadge('DATACENTER, AI LAB & TECH OPS', 'LEVEL 01', '#F59E0B');
  badgeL1.position.set(-8.5, 0.02, -12.0);
  terraces.add(badgeL1);

  // Downlight arsitektural Lantai 1
  const l1Downlight = THREE.PointLight ? new THREE.PointLight(0xFFE8CC, 0.40, 14, 1.8) : new THREE.Group();
  l1Downlight.position.set(0, 3.8, -7.4);
  terraces.add(l1Downlight);

  // ── AREA INDOOR ZEN GARDEN LANTAI 1 (Bonsai & River Pebbles Halus di Sudut Atrium) ──
  const zenGroup = new THREE.Group();
  const zenBase = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 2.8), M(0xD4AF37));
  zenBase.position.set(-10.0, 0.04, -6.8);
  zenGroup.add(zenBase);
  const sand = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.02, 2.5), M(0xFAF8F5));
  sand.position.set(-10.0, 0.09, -6.8);
  sand.receiveShadow = true;
  zenGroup.add(sand);
  // Batu kali lonjong halus tertata rapi di dalam halaman zen
  const PebbleGeom = THREE.SphereGeometry || THREE.BoxGeometry;
  [[-10.8, -7.4], [-9.4, -6.3], [-10.4, -6.2]].forEach(([bx, bz], bi) => {
    const pebble = new THREE.Mesh(new PebbleGeom(0.24 + bi * 0.05, 12, 10), M(0x334155));
    if (pebble.scale && pebble.scale.set) pebble.scale.set(1.3, 0.55, 1.0);
    pebble.position.set(bx, 0.16, bz);
    pebble.rotation.y = bi * 0.8;
    pebble.castShadow = true;
    zenGroup.add(pebble);
  });
  // Bonsai eksotis di tengah halaman zen
  const TrunkGeom = THREE.CylinderGeometry || THREE.BoxGeometry;
  const trunk = new THREE.Mesh(new TrunkGeom(0.08, 0.12, 0.75, 8), M(0x4A2E18));
  trunk.position.set(-10.0, 0.45, -6.8);
  trunk.rotation.z = -0.15;
  zenGroup.add(trunk);
  const FoliageGeom = THREE.SphereGeometry || THREE.BoxGeometry;
  const foliage = new THREE.Mesh(new FoliageGeom(0.46, 12, 10), M(0x10B981));
  if (foliage.scale && foliage.scale.set) foliage.scale.set(1.3, 0.65, 1.1);
  foliage.position.set(-10.1, 0.82, -6.8);
  foliage.castShadow = true;
  zenGroup.add(foliage);
  terraces.add(zenGroup);

  // ══════════════════════════════════════════════════════════
  // TANGGA 1: Naik dari Lantai 1 (Y=0) ke Lantai 2 (Y=0.60)
  // ══════════════════════════════════════════════════════════
  const buildGrandStaircase = (startX, startZ, startY, endZ, endY, width = 3.2, stepsCount = 6) => {
    const flight = new THREE.Group();
    const dz = (endZ - startZ) / stepsCount;
    const dy = (endY - startY) / stepsCount;
    const riserHeight = Math.abs(dy);

    for (let i = 0; i < stepsCount; i++) {
      const stepZ = startZ + (i + 0.5) * dz;
      const stepY = startY + (i + 1) * dy;

      // Pijakan anak tangga (tread) marmer abu-abu gelap
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.08, Math.abs(dz) * 1.15),
        M(0x1F2C42)
      );
      step.position.set(startX, stepY - 0.04, stepZ);
      step.castShadow = true;
      step.receiveShadow = true;
      flight.add(step);

      // Bidang tegak penutup anak tangga (riser) padat
      const riser = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.98, riserHeight * 1.05, 0.04),
        M(0x162236)
      );
      riser.position.set(startX, stepY - riserHeight * 0.5 - 0.04, stepZ - dz * 0.46);
      riser.castShadow = true;
      riser.receiveShadow = true;
      flight.add(riser);

      // Neon LED riser strip cyan menyala di hidung anak tangga
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.96, 0.02, 0.035),
        MB(0x00E5FF)
      );
      strip.position.set(startX, stepY - 0.045, stepZ + dz * 0.42);
      flight.add(strip);
      stepStrips.push(strip);
    }

    // Pagar kaca tempered & handrail kuningan mewah di kedua sisi tangga
    [-width / 2, width / 2].forEach(side => {
      // Dinding samping tangga (stringer solid)
      const stringer = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, Math.abs(endY - startY) * 0.6 + 0.2, Math.abs(endZ - startZ) * 1.05),
        M(0x0F172A)
      );
      stringer.position.set(startX + side, (startY + endY) / 2 - 0.05, (startZ + endZ) / 2);
      flight.add(stringer);

      const railGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.65, Math.abs(endZ - startZ) * 1.08),
        GlassRail()
      );
      railGlass.position.set(startX + side, (startY + endY) / 2 + 0.38, (startZ + endZ) / 2);
      flight.add(railGlass);

      const railMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, Math.abs(endZ - startZ) * 1.1),
        M(0xD4AF37)
      );
      railMesh.position.set(startX + side, (startY + endY) / 2 + 0.72, (startZ + endZ) / 2);
      railMesh.rotation.x = Math.atan2(endY - startY, endZ - startZ);
      flight.add(railMesh);
    });

    return flight;
  };

  // Sepasang tangga kembar L1 ➔ L2 (naik ke arah +Z)
  const stair1Left = buildGrandStaircase(-2.6, -1.8, 0, -0.6, L2_Y, 2.8, 6);
  const stair1Right = buildGrandStaircase(2.6, -1.8, 0, -0.6, L2_Y, 2.8, 6);
  terraces.add(stair1Left);
  terraces.add(stair1Right);

  // ══════════════════════════════════════════════════════════
  // LANTAI 2 (Level 02 — Mid Mezzanine / Tengah Layar, Z ∈ [-0.6, 4.5], Y = 0.60)
  // ══════════════════════════════════════════════════════════
  const l2Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, 0.20, 5.1),
    terrazzoMat('#F7EFE0', 4, 1.2) // Oak blonde bervein lembut
  );
  l2Deck.position.set(0, L2_Y - 0.10, 1.95);
  l2Deck.receiveShadow = true;
  terraces.add(l2Deck);

  // Bibir list emas & LED Cyan di tepi depan Lantai 2 (Z = -0.6)
  const l2Trim = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.06, 0.10),
    M(0xD4AF37)
  );
  l2Trim.position.set(0, L2_Y, -0.6);
  terraces.add(l2Trim);

  const l2Led = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.03, 0.05),
    MB(0x00F0FF) // LED neon cyan terang
  );
  l2Led.position.set(0, L2_Y - 0.03, -0.64);
  terraces.add(l2Led);
  ledLines.push(l2Led);

  // Lampu downlight arsitektural Lantai 2
  const l2Downlight = THREE.PointLight ? new THREE.PointLight(0x00E5FF, 0.45, 12, 1.8) : new THREE.Group();
  l2Downlight.position.set(0, L2_Y + 3.8, 1.95);
  terraces.add(l2Downlight);

  // Railing kaca pengaman Lantai 2 (membentang di tepi Z = -0.6 kecuali celah tangga)
  const addRail = (x, z, y, len) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.65, 0.03), GlassRail());
    glass.position.set(x, y + 0.33, z);
    terraces.add(glass);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.06), M(0xD4AF37));
    handrail.position.set(x, y + 0.66, z);
    terraces.add(handrail);
  };
  addRail(-10.5, -0.6, L2_Y, 13.0);
  addRail(10.5, -0.6, L2_Y, 13.0);

  // Plakat Lantai 2
  const badgeL2 = createFloorBadge('CORE ENGINEERING & PRODUCT STUDIO', 'LEVEL 02', '#00F0FF');
  badgeL2.position.set(-8.5, L2_Y + 0.02, 0.2);
  terraces.add(badgeL2);

  // ══════════════════════════════════════════════════════════
  // TANGGA 2: Naik dari Lantai 2 (Y=0.60) ke Lantai 3 (Y=1.20)
  // ══════════════════════════════════════════════════════════
  const stair2Left = buildGrandStaircase(-2.6, 3.8, L2_Y, 5.0, L3_Y, 2.8, 6);
  const stair2Right = buildGrandStaircase(2.6, 3.8, L2_Y, 5.0, L3_Y, 2.8, 6);
  terraces.add(stair2Left);
  terraces.add(stair2Right);

  // ══════════════════════════════════════════════════════════
  // LANTAI 3 (Level 03 — Executive Penthouse / Atas Layar, Z ∈ [5.0, 16], Y = 1.20)
  // ══════════════════════════════════════════════════════════
  const l3Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, 0.20, 11.0),
    terrazzoMat('#44576E', 3.5, 1.6) // Slate biru eksekutif
  );
  l3Deck.position.set(0, L3_Y - 0.10, 10.5);
  l3Deck.receiveShadow = true;
  terraces.add(l3Deck);

  // Bibir list emas & LED Emerald di tepi depan Lantai 3 (Z = 5.0)
  const l3Trim = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.06, 0.10),
    M(0xD4AF37)
  );
  l3Trim.position.set(0, L3_Y, 5.0);
  terraces.add(l3Trim);

  const l3Led = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.03, 0.05),
    MB(0x10E5A0) // LED emerald terang
  );
  l3Led.position.set(0, L3_Y - 0.03, 4.96);
  terraces.add(l3Led);
  ledLines.push(l3Led);

  // Lampu downlight arsitektural Lantai 3
  const l3Downlight = THREE.PointLight ? new THREE.PointLight(0x10E5A0, 0.55, 14, 1.8) : new THREE.Group();
  l3Downlight.position.set(0, L3_Y + 3.8, 10.5);
  terraces.add(l3Downlight);

  // Railing kaca pengaman Lantai 3
  addRail(-10.5, 5.0, L3_Y, 13.0);
  addRail(10.5, 5.0, L3_Y, 13.0);

  // Plakat Lantai 3 (Paling atas di layar)
  const badgeL3 = createFloorBadge('EXECUTIVE PENTHOUSE & FOUNDER SUITE', 'LEVEL 03', '#10E5A0');
  badgeL3.position.set(-8.5, L3_Y + 0.02, 5.8);
  terraces.add(badgeL3);

  // ══════════════════════════════════════════════════════════
  // PILAR STRUKTURAL GEDUNG TINGGI (High-Rise Skyscraper Pylons)
  // ══════════════════════════════════════════════════════════
  const addSkyscraperPylon = (x, z) => {
    const colGroup = new THREE.Group();
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), M(0x182438));
    col.position.set(0, 3.75, 0);
    colGroup.add(col);

    [0, L2_Y, L3_Y].forEach(y => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.10, 0.76), M(0xD4AF37));
      ring.position.set(0, y, 0);
      colGroup.add(ring);
    });

    const vLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 7.0, 0.72), MB(0x00F0FF));
    vLed.position.set(0, 3.75, 0);
    colGroup.add(vLed);
    ledLines.push(vLed);

    colGroup.position.set(x, 0, z);
    terraces.add(colGroup);
  };

  addSkyscraperPylon(-16.5, -0.6);
  addSkyscraperPylon(16.5, -0.6);
  addSkyscraperPylon(-16.5, 5.0);
  addSkyscraperPylon(16.5, 5.0);
  addSkyscraperPylon(-16.5, -13.5);
  addSkyscraperPylon(16.5, -13.5);
  addSkyscraperPylon(-16.5, 15.5);
  addSkyscraperPylon(16.5, 15.5);

  // ══════════════════════════════════════════════════════════
  // SINKRONISASI MODE GELAP / TERANG (Dynamic Lighting & Material Switch)
  // ══════════════════════════════════════════════════════════
  function setMode(isDark) {
    if (isDark) {
      // MODE GELAP (Cyberpunk Night Studio)
      l1Deck.material.color.set(0x162236); // Marmer hitam obsidian mewah
      l2Deck.material.color.set(0x182842); // Parquet navy eksekutif gelap
      l3Deck.material.color.set(0x121E30); // Walnut slate gelap
      l1Inlay.material.color.set(0x00E5FF);
      zenBase.material.color.set(0x00E5FF);
      l2Led.material.color.set(0x00F0FF);
      l3Led.material.color.set(0x10E5A0);
      stepStrips.forEach(s => s.material.color.set(0x00E5FF));
      ledLines.forEach(l => l.material.color.set(0x00F0FF));
      if (l1Downlight && l1Downlight.intensity !== undefined) l1Downlight.intensity = 0.65;
      if (l2Downlight && l2Downlight.intensity !== undefined) l2Downlight.intensity = 0.65;
      if (l3Downlight && l3Downlight.intensity !== undefined) l3Downlight.intensity = 0.75;
    } else {
      // MODE TERANG (Daylight Architectural Studio)
      l1Deck.material.color.set(0xF1F5F9); // Marmer putih bersih berkelas
      l2Deck.material.color.set(0xE2E8F0); // Parquet kayu hangat elegan
      l3Deck.material.color.set(0xCBD5E1); // Slate eksekutif berkelas
      l1Inlay.material.color.set(0xD4AF37); // Garis emas murni
      zenBase.material.color.set(0xD4AF37);
      l2Led.material.color.set(0x00F0FF);
      l3Led.material.color.set(0x10E5A0);
      stepStrips.forEach(s => s.material.color.set(0x00E5FF));
      ledLines.forEach(l => l.material.color.set(0x00F0FF));
      if (l1Downlight && l1Downlight.intensity !== undefined) l1Downlight.intensity = 0.45;
      if (l2Downlight && l2Downlight.intensity !== undefined) l2Downlight.intensity = 0.45;
      if (l3Downlight && l3Downlight.intensity !== undefined) l3Downlight.intensity = 0.45;
    }
  }

  office.add(terraces);

  return {
    terraces,
    L2_Y,
    L3_Y,
    l1Deck,
    l2Deck,
    l3Deck,
    setMode,
  };
}
