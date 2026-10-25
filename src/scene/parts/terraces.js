// parts/terraces.js — Arsitektur Kampus Megah 3 Lantai WFS PROJECT
// Skala kampus diperluas (46.0m lebar x 36.5m kedalaman) dengan Grand Staircase ganda,
// koridor luas, dan pembagian sayap Barat (West Wing), Tengah (Central Hub), dan Timur (East Wing).

export function createTerraces({ THREE, office, M, MB }) {
  const terraces = new THREE.Group();
  office.add(terraces);

  // Ketinggian lantai bertingkat
  const L2_Y = 0.60;
  const L3_Y = 1.20;

  const GlassRail = () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x99D5F5,
      transparent: true,
      opacity: 0.35,
      roughness: 0.05,
      transmission: 0.90,
      ior: 1.5,
      reflectivity: 0.85
    });

  const ledLines = [];
  const stepStrips = [];

  // Helper plakat penanda lantai elegan
  const createFloorBadge = (title, levelText, colorHex) => {
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 120;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.roundRect ? ctx.roundRect(4, 4, 632, 112, 16) : ctx.rect(4, 4, 632, 112);
    ctx.fill();

    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.roundRect ? ctx.roundRect(4, 4, 632, 112, 16) : ctx.rect(4, 4, 632, 112);
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.font = 'bold 36px Orbitron, sans-serif';
    ctx.fillText(levelText, 24, 72);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.fillText(title, 220, 70);

    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;

    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 0.92),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // ══════════════════════════════════════════════════════════
  // LANTAI 1 (Level 01 — Atrium / Depan Kamera, Z ∈ [-17.0, -0.6], Y = 0)
  // ══════════════════════════════════════════════════════════
  const l1Deck = new THREE.Mesh(
    new THREE.BoxGeometry(46.0, 0.20, 16.4),
    M(0xFFFFFF) // Marmer Putih Carrara Mewah
  );
  l1Deck.position.set(0, -0.10, -8.8);
  l1Deck.receiveShadow = true;
  terraces.add(l1Deck);

  // Inlay lis emas elegan di tepi depan Lantai 1
  const l1Inlay = new THREE.Mesh(
    new THREE.BoxGeometry(45.8, 0.015, 0.08),
    M(0xD4AF37)
  );
  l1Inlay.position.set(0, 0.01, -16.5);
  terraces.add(l1Inlay);

  // Plakat Lantai 1
  const badgeL1 = createFloorBadge('DATACENTER, AI LAB & TECH OPS', 'LEVEL 01', '#F59E0B');
  badgeL1.position.set(-11.5, 0.02, -15.5);
  terraces.add(badgeL1);

  // Downlight arsitektural Lantai 1
  [-14, 0, 14].forEach(lx => {
    const dl = THREE.PointLight ? new THREE.PointLight(0xFFE8CC, 0.40, 16, 1.8) : new THREE.Group();
    dl.position.set(lx, 4.2, -8.8);
    terraces.add(dl);
  });

  // ── AREA INDOOR ZEN GARDEN LANTAI 1 (Sayap Barat) ──
  const zenGroup = new THREE.Group();
  const zenBase = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 3.8), M(0xD4AF37));
  zenBase.position.set(-16.0, 0.04, -8.5);
  zenGroup.add(zenBase);

  const sand = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.02, 3.4), M(0xFAF8F5));
  sand.position.set(-16.0, 0.09, -8.5);
  sand.receiveShadow = true;
  zenGroup.add(sand);

  const PebbleGeom = THREE.SphereGeometry || THREE.BoxGeometry;
  [[-17.2, -9.2], [-15.2, -7.8], [-16.5, -7.8]].forEach(([bx, bz], bi) => {
    const pebble = new THREE.Mesh(new PebbleGeom(0.32 + bi * 0.06, 12, 10), M(0x334155));
    if (pebble.scale && pebble.scale.set) pebble.scale.set(1.3, 0.55, 1.0);
    pebble.position.set(bx, 0.18, bz);
    pebble.rotation.y = bi * 0.8;
    pebble.castShadow = true;
    zenGroup.add(pebble);
  });

  const TrunkGeom = THREE.CylinderGeometry || THREE.BoxGeometry;
  const trunk = new THREE.Mesh(new TrunkGeom(0.10, 0.15, 0.95, 8), M(0x4A2E18));
  trunk.position.set(-16.0, 0.55, -8.5);
  trunk.rotation.z = -0.15;
  zenGroup.add(trunk);

  const FoliageGeom = THREE.SphereGeometry || THREE.BoxGeometry;
  const foliage = new THREE.Mesh(new FoliageGeom(0.65, 12, 10), M(0x10B981));
  if (foliage.scale && foliage.scale.set) foliage.scale.set(1.3, 0.65, 1.1);
  foliage.position.set(-16.1, 1.02, -8.5);
  foliage.castShadow = true;
  zenGroup.add(foliage);
  terraces.add(zenGroup);

  // ══════════════════════════════════════════════════════════
  // GRAND STAIRCASES (Tangga Mewah Penghubung)
  // ══════════════════════════════════════════════════════════
  const buildGrandStaircase = (startX, startZ, startY, endZ, endY, width = 3.6, stepsCount = 7) => {
    const flight = new THREE.Group();
    const dz = (endZ - startZ) / stepsCount;
    const dy = (endY - startY) / stepsCount;
    const riserHeight = Math.abs(dy);

    for (let i = 0; i < stepsCount; i++) {
      const stepZ = startZ + (i + 0.5) * dz;
      const stepY = startY + (i + 1) * dy;

      const step = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.08, Math.abs(dz) * 1.15),
        M(0x1F2C42)
      );
      step.position.set(startX, stepY - 0.04, stepZ);
      step.castShadow = true;
      step.receiveShadow = true;
      flight.add(step);

      const riser = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.98, riserHeight * 1.05, 0.04),
        M(0x162236)
      );
      riser.position.set(startX, stepY - riserHeight * 0.5 - 0.04, stepZ - dz * 0.46);
      riser.castShadow = true;
      riser.receiveShadow = true;
      flight.add(riser);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.96, 0.02, 0.035),
        MB(0x00E5FF)
      );
      strip.position.set(startX, stepY - 0.045, stepZ + dz * 0.42);
      flight.add(strip);
      stepStrips.push(strip);
    }

    [-width / 2, width / 2].forEach(side => {
      const stringer = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, Math.abs(endY - startY) * 0.6 + 0.25, Math.abs(endZ - startZ) * 1.05),
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

  // Sepasang tangga kembar L1 ➔ L2 (naik ke arah +Z) di x = -2.6 dan x = +2.6
  const stair1Left = buildGrandStaircase(-2.6, -1.8, 0, -0.6, L2_Y, 3.4, 7);
  const stair1Right = buildGrandStaircase(2.6, -1.8, 0, -0.6, L2_Y, 3.4, 7);
  terraces.add(stair1Left);
  terraces.add(stair1Right);

  // ══════════════════════════════════════════════════════════
  // LANTAI 2 (Level 02 — Mezzanine / Tengah Layar, Z ∈ [-0.6, 5.0], Y = 0.60)
  // ══════════════════════════════════════════════════════════
  const l2Deck = new THREE.Mesh(
    new THREE.BoxGeometry(46.0, 0.20, 5.6),
    M(0xEAD8C2) // Scandinavian warm blonde oak parquet
  );
  l2Deck.position.set(0, L2_Y - 0.10, 2.2);
  l2Deck.receiveShadow = true;
  terraces.add(l2Deck);

  // Bibir list emas & LED Cyan di tepi depan Lantai 2 (Z = -0.6)
  const l2Trim = new THREE.Mesh(
    new THREE.BoxGeometry(46.04, 0.06, 0.10),
    M(0xD4AF37)
  );
  l2Trim.position.set(0, L2_Y, -0.6);
  terraces.add(l2Trim);

  const l2Led = new THREE.Mesh(
    new THREE.BoxGeometry(46.04, 0.03, 0.05),
    MB(0x00F0FF) // LED neon cyan terang
  );
  l2Led.position.set(0, L2_Y - 0.03, -0.64);
  terraces.add(l2Led);
  ledLines.push(l2Led);

  [-14, 0, 14].forEach(lx => {
    const dl = THREE.PointLight ? new THREE.PointLight(0x00E5FF, 0.45, 14, 1.8) : new THREE.Group();
    dl.position.set(lx, L2_Y + 4.0, 2.2);
    terraces.add(dl);
  });

  // Railing kaca pengaman Lantai 2 (membentang di tepi Z = -0.6)
  const addRail = (x, z, y, len) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.65, 0.03), GlassRail());
    glass.position.set(x, y + 0.33, z);
    terraces.add(glass);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.06), M(0xD4AF37));
    handrail.position.set(x, y + 0.66, z);
    terraces.add(handrail);
  };
  addRail(-13.5, -0.6, L2_Y, 18.0);
  addRail(13.5, -0.6, L2_Y, 18.0);
  addRail(0, -0.6, L2_Y, 1.6);

  // Plakat Lantai 2
  const badgeL2 = createFloorBadge('CORE ENGINEERING & PRODUCT STUDIO', 'LEVEL 02', '#00F0FF');
  badgeL2.position.set(-11.5, L2_Y + 0.02, 0.2);
  terraces.add(badgeL2);

  // ══════════════════════════════════════════════════════════
  // TANGGA 2: Naik dari Lantai 2 (Y=0.60) ke Lantai 3 (Y=1.20)
  // ══════════════════════════════════════════════════════════
  const stair2Left = buildGrandStaircase(-2.6, 3.8, L2_Y, 5.0, L3_Y, 3.4, 7);
  const stair2Right = buildGrandStaircase(2.6, 3.8, L2_Y, 5.0, L3_Y, 3.4, 7);
  terraces.add(stair2Left);
  terraces.add(stair2Right);

  // ══════════════════════════════════════════════════════════
  // LANTAI 3 (Level 03 — Executive Penthouse, Z ∈ [5.0, 18.0], Y = 1.20)
  // ══════════════════════════════════════════════════════════
  const l3Deck = new THREE.Mesh(
    new THREE.BoxGeometry(46.0, 0.20, 13.0),
    M(0x1E293B) // Executive Midnight Smoked Slate Parquet
  );
  l3Deck.position.set(0, L3_Y - 0.10, 11.5);
  l3Deck.receiveShadow = true;
  terraces.add(l3Deck);

  const l3Trim = new THREE.Mesh(
    new THREE.BoxGeometry(46.04, 0.06, 0.10),
    M(0xD4AF37)
  );
  l3Trim.position.set(0, L3_Y, 5.0);
  terraces.add(l3Trim);

  const l3Led = new THREE.Mesh(
    new THREE.BoxGeometry(46.04, 0.03, 0.05),
    MB(0x10E5A0) // LED emerald terang
  );
  l3Led.position.set(0, L3_Y - 0.03, 4.96);
  terraces.add(l3Led);
  ledLines.push(l3Led);

  [-14, 0, 14].forEach(lx => {
    const dl = THREE.PointLight ? new THREE.PointLight(0x10E5A0, 0.55, 16, 1.8) : new THREE.Group();
    dl.position.set(lx, L3_Y + 4.0, 11.5);
    terraces.add(dl);
  });

  addRail(-13.5, 5.0, L3_Y, 18.0);
  addRail(13.5, 5.0, L3_Y, 18.0);
  addRail(0, 5.0, L3_Y, 1.6);

  // Plakat Lantai 3
  const badgeL3 = createFloorBadge('EXECUTIVE PENTHOUSE & FOUNDER SUITE', 'LEVEL 03', '#10E5A0');
  badgeL3.position.set(-11.5, L3_Y + 0.02, 5.8);
  terraces.add(badgeL3);

  // ══════════════════════════════════════════════════════════
  // PILAR STRUKTURAL GEDUNG MEGAH (High-Rise Skyscraper Pylons)
  // ══════════════════════════════════════════════════════════
  const addSkyscraperPylon = (x, z) => {
    const colGroup = new THREE.Group();
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), M(0x182438));
    col.position.set(0, 4.25, 0);
    colGroup.add(col);

    [0, L2_Y, L3_Y].forEach(y => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.88), M(0xD4AF37));
      ring.position.set(0, y, 0);
      colGroup.add(ring);
    });

    const vLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 8.0, 0.82), MB(0x00F0FF));
    vLed.position.set(0, 4.25, 0);
    colGroup.add(vLed);
    ledLines.push(vLed);

    colGroup.position.set(x, 0, z);
    terraces.add(colGroup);
  };

  [-22.0, -11.0, 11.0, 22.0].forEach(cx => {
    [-16.0, -0.6, 5.0, 17.0].forEach(cz => {
      addSkyscraperPylon(cx, cz);
    });
  });

  // ══════════════════════════════════════════════════════════
  // SINKRONISASI MODE GELAP / TERANG (Dynamic Lighting & Material Switch)
  // ══════════════════════════════════════════════════════════
  function setMode(isDark) {
    if (isDark) {
      l1Deck.material.color.set(0x162236);
      l2Deck.material.color.set(0x182842);
      l3Deck.material.color.set(0x121E30);
      l1Inlay.material.color.set(0x00E5FF);
      zenBase.material.color.set(0x00E5FF);
      l2Led.material.color.set(0x00F0FF);
      l3Led.material.color.set(0x10E5A0);
      stepStrips.forEach(s => s.material.color.set(0x00E5FF));
      ledLines.forEach(l => l.material.color.set(0x00F0FF));
    } else {
      l1Deck.material.color.set(0xF1F5F9);
      l2Deck.material.color.set(0xE2E8F0);
      l3Deck.material.color.set(0xCBD5E1);
      l1Inlay.material.color.set(0xD4AF37);
      zenBase.material.color.set(0xD4AF37);
      l2Led.material.color.set(0x00F0FF);
      l3Led.material.color.set(0x10E5A0);
      stepStrips.forEach(s => s.material.color.set(0x00E5FF));
      ledLines.forEach(l => l.material.color.set(0x00F0FF));
    }
  }

  return {
    terraces,
    L2_Y,
    L3_Y,
    l1Deck,
    l2Deck,
    l3Deck,
    setMode
  };
}
