// parts/terraces.js — Arsitektur Gedung Pencakar Langit 3 Lantai Bertingkat (High-Rise Skyscraper Headquarters)
// Perluasan skala area kantor (34m x 30m) dengan 3 lantai bertingkat nyata (Level 1: 0m, Level 2: 1.6m, Level 3: 3.2m),
// tangga megah melayang (floating illuminated grand stairs), pilar arsitektural gedung tinggi,
// zona baru (Zen Garden, Brainstorm Arena, Sky Balcony, Datacenter), dan sistem pencahayaan stabil anti-hancur.

export function createTerraces({ THREE, office, M, MB }) {
  const terraces = new THREE.Group();

  // Tinggi Lantai Gedung Nyata (Tiap lantai naik 1.60m)
  const L2_Y = 1.60;
  const L3_Y = 3.20;

  // Koleksi lampu & strip LED untuk sinkronisasi mode Gelap / Terang
  const stepStrips = [];
  const ledLines = [];

  // Material Kaca Balustrade Transparan & Mewah
  const GlassRail = () => new THREE.MeshPhysicalMaterial({
    color: 0xCCE8FF,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    transmission: 0.90,
    thickness: 0.4,
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

      // Label Lantai / Level
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 24px "DM Mono", monospace';
      ctx.fillText(levelText, 28, 42);

      // Deskripsi Departemen
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

  // ══════════════════════════════════════════════════════════
  // LANTAI 1: Ground Level Atrium & Lobby (Y = 0, Z ∈ [3.5, 16])
  // ══════════════════════════════════════════════════════════
  // Perluasan lantai marmer eksekutif dasar (Ground Floor Plate)
  const l1Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, 0.1, 13.0),
    M(0xF1F5F9) // Default: marmer putih bersih berkelas
  );
  l1Deck.position.set(0, -0.05, 9.8);
  l1Deck.receiveShadow = true;
  terraces.add(l1Deck);

  // Inlay garis emas geometris di lantai dasar
  const l1Inlay = new THREE.Mesh(
    new THREE.BoxGeometry(33.8, 0.015, 0.08),
    M(0xD4AF37)
  );
  l1Inlay.position.set(0, 0.01, 15.5);
  terraces.add(l1Inlay);

  // Plakat Lantai 1
  const badgeL1 = createFloorBadge('GRAND LOBBY, CLIENT OPS & ZEN ATRIUM', 'LEVEL 01', '#F59E0B');
  badgeL1.position.set(-8.5, 0.02, 12.0);
  terraces.add(badgeL1);

  // Lampu downlight arsitektural Lantai 1
  const l1Downlight = THREE.PointLight ? new THREE.PointLight(0xFFE8CC, 0.45, 14, 1.8) : new THREE.Group();
  l1Downlight.position.set(0, 4.5, 9.5);
  terraces.add(l1Downlight);

  // ── AREA BARU LANTAI 1: Indoor Zen Garden & Rock Water Feature ──
  const zenGroup = new THREE.Group();
  const zenBase = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.15, 4.2), M(0xD8D0C5));
  zenBase.position.set(-11.5, 0.075, 11.5);
  zenGroup.add(zenBase);
  // Pasir putih zen garden
  const sand = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.02, 3.9), M(0xFAF7F2));
  sand.position.set(-11.5, 0.16, 11.5);
  sand.receiveShadow = true;
  zenGroup.add(sand);
  // Batu zen hitam & tanaman indoor
  [[-13, 10.5], [-11.5, 12], [-10.2, 11]].forEach(([bx, bz], bi) => {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(0.5 + bi * 0.1, 0.35, 0.45), M(0x475569));
    rock.position.set(bx, 0.35, bz);
    rock.rotation.y = bi * 0.6;
    rock.castShadow = true;
    zenGroup.add(rock);
  });
  // Pot tanaman bambu tinggi
  const planter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), M(0xD4AF37));
  planter.position.set(-8.8, 0.4, 11.5);
  zenGroup.add(planter);
  terraces.add(zenGroup);

  // ── AREA BARU LANTAI 1: Townhall Auditorium Stepped Seating ──
  const townhallGroup = new THREE.Group();
  [0, 1, 2].forEach(step => {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.22, 1.0),
      M(0x334155)
    );
    seat.position.set(11.5, 0.11 + step * 0.22, 10.5 + step * 1.0);
    seat.receiveShadow = true;
    townhallGroup.add(seat);
    // Bantal kursi empuk
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.04, 0.9),
      M(0x2563EB)
    );
    cushion.position.set(11.5, 0.24 + step * 0.22, 10.5 + step * 1.0);
    townhallGroup.add(cushion);
  });
  terraces.add(townhallGroup);

  // ══════════════════════════════════════════════════════════
  // LANTAI 2: Mid Engineering Mezzanine (Y = 1.60m, Z ∈ [-2.0, 3.5])
  // ══════════════════════════════════════════════════════════
  const l2Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, L2_Y, 5.5),
    M(0xE2E8F0) // Default: natural oak parquet
  );
  l2Deck.position.set(0, L2_Y / 2, 0.75);
  l2Deck.receiveShadow = true;
  terraces.add(l2Deck);

  // Bibir list emas & LED Cyan di sepanjang tepi depan Lantai 2 (Z = 3.5)
  const l2Trim = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.08, 0.14),
    M(0xD4AF37) // List champagne gold
  );
  l2Trim.position.set(0, L2_Y, 3.5);
  terraces.add(l2Trim);

  const l2Led = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.04, 0.06),
    MB(0x00F0FF) // LED neon cyan terang benderang
  );
  l2Led.position.set(0, L2_Y - 0.04, 3.54);
  terraces.add(l2Led);
  ledLines.push(l2Led);

  // Lampu downlight arsitektural Lantai 2
  const l2Downlight = THREE.PointLight ? new THREE.PointLight(0x00E5FF, 0.45, 12, 1.8) : new THREE.Group();
  l2Downlight.position.set(0, L2_Y + 3.8, 0.75);
  terraces.add(l2Downlight);

  // Railing kaca pengaman Lantai 2 (sayap kiri dan kanan tangga)
  const addRail = (x, z, y, len) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.75, 0.04), GlassRail());
    glass.position.set(x, y + 0.38, z);
    terraces.add(glass);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.08), M(0xD4AF37));
    handrail.position.set(x, y + 0.76, z);
    terraces.add(handrail);
  };
  addRail(-10.5, 3.5, L2_Y, 13.0); // Sayap kiri L2
  addRail(10.5, 3.5, L2_Y, 13.0);  // Sayap kanan L2

  // Plakat Lantai 2
  const badgeL2 = createFloorBadge('CORE ENGINEERING & PRODUCT LAB', 'LEVEL 02', '#00F0FF');
  badgeL2.position.set(-8.5, L2_Y + 0.02, 2.8);
  terraces.add(badgeL2);

  // ── AREA BARU LANTAI 2: Brainstorming Lounge & Whiteboard Arena ──
  const brainstormGroup = new THREE.Group();
  // Whiteboard kaca melayang
  const wbGlass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 0.05), GlassRail());
  wbGlass.position.set(13.5, L2_Y + 1.2, 0.5);
  brainstormGroup.add(wbGlass);
  const wbFrame = new THREE.Mesh(new THREE.BoxGeometry(3.68, 1.88, 0.06), M(0xD4AF37));
  wbFrame.position.set(13.5, L2_Y + 1.2, 0.5);
  brainstormGroup.add(wbFrame);
  // Sofa santai melengkung
  const loungeSeat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 1.4), M(0x2563EB));
  loungeSeat.position.set(13.5, L2_Y + 0.22, 1.8);
  brainstormGroup.add(loungeSeat);
  terraces.add(brainstormGroup);

  // ══════════════════════════════════════════════════════════
  // LANTAI 3: Sky Penthouse & Cloud Ops (Y = 3.20m, Z ∈ [-14, -2.0])
  // ══════════════════════════════════════════════════════════
  const l3Deck = new THREE.Mesh(
    new THREE.BoxGeometry(34.0, L3_Y, 12.0),
    M(0xCBD5E1) // Default: light executive slate
  );
  l3Deck.position.set(0, L3_Y / 2, -8.0);
  l3Deck.receiveShadow = true;
  terraces.add(l3Deck);

  // Bibir list emas & LED Emerald di sepanjang tepi depan Lantai 3 (Z = -2.0)
  const l3Trim = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.08, 0.14),
    M(0xD4AF37)
  );
  l3Trim.position.set(0, L3_Y, -2.0);
  terraces.add(l3Trim);

  const l3Led = new THREE.Mesh(
    new THREE.BoxGeometry(34.04, 0.04, 0.06),
    MB(0x10E5A0) // LED emerald terang
  );
  l3Led.position.set(0, L3_Y - 0.04, -1.96);
  terraces.add(l3Led);
  ledLines.push(l3Led);

  // Lampu downlight arsitektural Lantai 3
  const l3Downlight = THREE.PointLight ? new THREE.PointLight(0x10E5A0, 0.55, 14, 1.8) : new THREE.Group();
  l3Downlight.position.set(0, L3_Y + 3.8, -6.5);
  terraces.add(l3Downlight);

  // Railing kaca pengaman Lantai 3
  addRail(-10.5, -2.0, L3_Y, 13.0); // Sayap kiri L3
  addRail(10.5, -2.0, L3_Y, 13.0);  // Sayap kanan L3

  // Plakat Lantai 3
  const badgeL3 = createFloorBadge('SKY COMMAND, CLOUD OPS & ROOFTOP', 'LEVEL 03', '#10E5A0');
  badgeL3.position.set(-8.5, L3_Y + 0.02, -2.8);
  terraces.add(badgeL3);

  // ── AREA BARU LANTAI 3: Sky Balcony & Observation Deck ──
  const balconyGroup = new THREE.Group();
  // Deck kayu outdoor di sayap kiri belakang
  const outDeck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.04, 5.0), M(0x27272A));
  outDeck.position.set(-13.0, L3_Y + 0.02, -10.5);
  balconyGroup.add(outDeck);
  // Railing kaca luar pemandangan
  const outRail = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.04), GlassRail());
  outRail.position.set(-13.0, L3_Y + 0.4, -13.0);
  balconyGroup.add(outRail);
  // Teleskop observasi langit
  const scopeBase = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), M(0xD4AF37));
  scopeBase.position.set(-13.0, L3_Y + 0.6, -12.4);
  balconyGroup.add(scopeBase);
  const scopeTube = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.8), M(0x00F0FF));
  scopeTube.rotation.x = Math.PI / 4;
  scopeTube.position.set(-13.0, L3_Y + 1.3, -12.4);
  balconyGroup.add(scopeTube);
  terraces.add(balconyGroup);

  // ══════════════════════════════════════════════════════════
  // TANGGA MEWAH GEDUNG BERTINGKAT (Grand Architectural Floating Staircases)
  // ══════════════════════════════════════════════════════════
  const buildGrandStaircase = (startX, startZ, startY, endZ, endY, width = 3.2, stepsCount = 8) => {
    const flight = new THREE.Group();
    const dz = (endZ - startZ) / stepsCount;
    const dy = (endY - startY) / stepsCount;

    for (let i = 0; i < stepsCount; i++) {
      const stepZ = startZ + (i + 0.5) * dz;
      const stepY = startY + (i + 1) * dy;

      // Anak tangga balok kayu eksekutif tebal
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.08, Math.abs(dz) * 1.1),
        M(0x1F2C42)
      );
      step.position.set(startX, stepY - 0.04, stepZ);
      step.castShadow = true;
      step.receiveShadow = true;
      flight.add(step);

      // Lampu pendar LED di bawah setiap anak tangga (Under-Step Light Strip)
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.96, 0.02, 0.04),
        MB(0x00E5FF)
      );
      strip.position.set(startX, stepY - 0.07, stepZ + dz * 0.42);
      flight.add(strip);
      stepStrips.push(strip);
    }

    // Railing kaca samping tangga dengan handrail emas
    [-width / 2, width / 2].forEach(side => {
      const railGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.65, Math.abs(endZ - startZ) * 1.1),
        GlassRail()
      );
      railGlass.position.set(startX + side, (startY + endY) / 2 + 0.4, (startZ + endZ) / 2);
      flight.add(railGlass);

      const railMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.04, Math.abs(endZ - startZ) * 1.12),
        M(0xD4AF37)
      );
      railMesh.position.set(startX + side, (startY + endY) / 2 + 0.72, (startZ + endZ) / 2);
      railMesh.rotation.x = Math.atan2(endY - startY, endZ - startZ);
      flight.add(railMesh);
    });

    return flight;
  };

  // Tangga 1: Dari Lantai 1 (Y=0, Z=5.6) naik ke Lantai 2 (Y=1.60, Z=3.5)
  // Sepasang tangga kembar arsitektural (Twin Grand Stairs)
  const stair1Left = buildGrandStaircase(-2.4, 5.6, 0, 3.5, L2_Y, 2.6, 8);
  const stair1Right = buildGrandStaircase(2.4, 5.6, 0, 3.5, L2_Y, 2.6, 8);
  terraces.add(stair1Left);
  terraces.add(stair1Right);

  // Tangga 2: Dari Lantai 2 (Y=1.60, Z=0.1) naik ke Lantai 3 (Y=3.20, Z=-2.0)
  const stair2Left = buildGrandStaircase(-2.4, 0.1, L2_Y, -2.0, L3_Y, 2.6, 8);
  const stair2Right = buildGrandStaircase(2.4, 0.1, L2_Y, -2.0, L3_Y, 2.6, 8);
  terraces.add(stair2Left);
  terraces.add(stair2Right);

  // ══════════════════════════════════════════════════════════
  // PILAR STRUKTURAL GEDUNG TINGGI (High-Rise Skyscraper Pylons)
  // ══════════════════════════════════════════════════════════
  // Kolom baja vertikal raksasa menembus dari dasar sampai atap
  const addSkyscraperPylon = (x, z) => {
    const colGroup = new THREE.Group();
    // Tiang struktural setinggi 8 meter
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), M(0x182438));
    col.position.set(0, 4.25, 0);
    colGroup.add(col);

    // Cincin emas di setiap level lantai
    [0, L2_Y, L3_Y].forEach(y => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.88), M(0xD4AF37));
      ring.position.set(0, y, 0);
      colGroup.add(ring);
    });

    // Jalur LED vertikal cyan terang di sepanjang tiang
    const vLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 8.0, 0.84), MB(0x00F0FF));
    vLed.position.set(0, 4.25, 0);
    colGroup.add(vLed);
    ledLines.push(vLed);

    colGroup.position.set(x, 0, z);
    terraces.add(colGroup);
  };

  addSkyscraperPylon(-16.5, 3.5);   // Pylon Lantai 1/2 Kiri
  addSkyscraperPylon(16.5, 3.5);    // Pylon Lantai 1/2 Kanan
  addSkyscraperPylon(-16.5, -2.0);  // Pylon Lantai 2/3 Kiri
  addSkyscraperPylon(16.5, -2.0);   // Pylon Lantai 2/3 Kanan
  addSkyscraperPylon(-16.5, 14.5);  // Pylon Sudut Depan Kiri
  addSkyscraperPylon(16.5, 14.5);   // Pylon Sudut Depan Kanan
  addSkyscraperPylon(-16.5, -13.5); // Pylon Sudut Belakang Kiri
  addSkyscraperPylon(16.5, -13.5);  // Pylon Sudut Belakang Kanan

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
      zenBase.material.color.set(0x1E293B);
      l2Led.material.color.set(0x00F0FF);
      l3Led.material.color.set(0x10E5A0);
      stepStrips.forEach(s => s.material.color.set(0x00E5FF));
      ledLines.forEach(l => l.material.color.set(0x00F0FF));
      if (l1Downlight) l1Downlight.intensity = 0.65;
      if (l2Downlight) l2Downlight.intensity = 0.65;
      if (l3Downlight) l3Downlight.intensity = 0.75;
    } else {
      // MODE TERANG (Daylight Architectural Studio)
      l1Deck.material.color.set(0xF1F5F9); // Marmer putih bersih berkelas
      l2Deck.material.color.set(0xE2E8F0); // Parquet terang elegan
      l3Deck.material.color.set(0xCBD5E1); // Slate terang eksekutif
      l1Inlay.material.color.set(0xD4AF37); // Garis emas murni
      zenBase.material.color.set(0xD8D0C5);
      l2Led.material.color.set(0x3B82F6);
      l3Led.material.color.set(0x10B981);
      stepStrips.forEach(s => s.material.color.set(0x60A5FA));
      ledLines.forEach(l => l.material.color.set(0x60A5FA));
      if (l1Downlight) l1Downlight.intensity = 0.35;
      if (l2Downlight) l2Downlight.intensity = 0.35;
      if (l3Downlight) l3Downlight.intensity = 0.35;
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
