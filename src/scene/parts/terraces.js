// parts/terraces.js — Arsitektur 3 Lantai Bertingkat (Stepped High-Rise Terraces & Stairs)
// Membagi area kantor menjadi 3 zona departemen bertingkat (Lantai 1, Lantai 2, Lantai 3)
// dengan tangga naik elegan, pilar arsitektural gedung tinggi, railing kaca, dan strip LED pendar.
// Desain berundak ke belakang (+Y, -Z) sehingga seluruh lantai terlihat jelas dari sudut kamera.

export function createTerraces({ THREE, office, M, MB }) {
  const terraces = new THREE.Group();

  // Material Kaca Transparan Balustrade
  const GlassRail = () => new THREE.MeshPhysicalMaterial({
    color: 0xCCE8FF,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    transmission: 0.85,
    thickness: 0.3,
  });

  // Helper untuk membuat teks plakat lantai bercahaya
  const createFloorBadge = (text, levelText, accentColor) => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(6, 12, 26, 0.92)';
      ctx.roundRect ? ctx.roundRect(4, 4, 504, 88, 14) : ctx.rect(4, 4, 504, 88);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Label Lantai
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 22px "DM Mono", monospace';
      ctx.fillText(levelText, 24, 38);

      // Deskripsi Departemen
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px "DM Sans", sans-serif';
      ctx.fillText(text, 24, 72);
    }
    const tex = new THREE.CanvasTexture(cv);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 0.68),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // ══════════════════════════════════════════════════════════
  // LANTAI 2: Mid Engineering Mezzanine (H = 0.22m, Z ∈ [-1.2, 3.8])
  // ══════════════════════════════════════════════════════════
  const L2_Y = 0.22;
  const l2Deck = new THREE.Mesh(
    new THREE.BoxGeometry(25.4, L2_Y, 5.0),
    M(0x18263D) // Deck parket navy eksekutif
  );
  l2Deck.position.set(0, L2_Y / 2, 1.3);
  l2Deck.receiveShadow = true;
  terraces.add(l2Deck);

  // Bibir list emas & LED cyan di sepanjang tepi depan Lantai 2 (Z = 3.8)
  const l2Trim = new THREE.Mesh(
    new THREE.BoxGeometry(25.42, 0.04, 0.08),
    M(0xD4AF37) // List champagne gold
  );
  l2Trim.position.set(0, L2_Y, 3.8);
  terraces.add(l2Trim);

  const l2Led = new THREE.Mesh(
    new THREE.BoxGeometry(25.42, 0.02, 0.03),
    MB(0x00F0FF) // LED cyan terang
  );
  l2Led.position.set(0, L2_Y - 0.02, 3.82);
  terraces.add(l2Led);

  // Railing kaca pengaman Lantai 2 (di sisi kiri & kanan tangga tengah)
  const addRail = (x, z, y, len) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.03), GlassRail());
    glass.position.set(x, y + 0.21, z);
    terraces.add(glass);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.05), M(0xD4AF37));
    handrail.position.set(x, y + 0.42, z);
    terraces.add(handrail);
  };
  addRail(-7.8, 3.8, L2_Y, 9.2); // Sayap kiri L2
  addRail(7.8, 3.8, L2_Y, 9.2);  // Sayap kanan L2

  // Plakat Lantai 2
  const badgeL2 = createFloorBadge('CORE ENGINEERING & PRODUCT LAB', 'LEVEL 2', '#00F0FF');
  badgeL2.position.set(-6.5, L2_Y + 0.01, 3.2);
  terraces.add(badgeL2);

  // ══════════════════════════════════════════════════════════
  // LANTAI 3: Sky Command & AI Architecture Terrace (H = 0.44m, Z ∈ [-9.5, -1.2])
  // ══════════════════════════════════════════════════════════
  const L3_Y = 0.44;
  const l3Deck = new THREE.Mesh(
    new THREE.BoxGeometry(25.4, L3_Y, 8.2),
    M(0x101B2E) // Deck dark slate eksekutif
  );
  l3Deck.position.set(0, L3_Y / 2, -5.3);
  l3Deck.receiveShadow = true;
  terraces.add(l3Deck);

  // Bibir list emas & LED emerald/cyan di sepanjang tepi depan Lantai 3 (Z = -1.2)
  const l3Trim = new THREE.Mesh(
    new THREE.BoxGeometry(25.42, 0.04, 0.08),
    M(0xD4AF37)
  );
  l3Trim.position.set(0, L3_Y, -1.2);
  terraces.add(l3Trim);

  const l3Led = new THREE.Mesh(
    new THREE.BoxGeometry(25.42, 0.02, 0.03),
    MB(0x10E5A0) // LED emerald terang
  );
  l3Led.position.set(0, L3_Y - 0.02, -1.18);
  terraces.add(l3Led);

  // Railing kaca pengaman Lantai 3
  addRail(-7.8, -1.2, L3_Y, 9.2); // Sayap kiri L3
  addRail(7.8, -1.2, L3_Y, 9.2);  // Sayap kanan L3

  // Plakat Lantai 3
  const badgeL3 = createFloorBadge('CLOUD OPS, AI LAB & STRATEGY', 'LEVEL 3', '#10E5A0');
  badgeL3.position.set(-6.5, L3_Y + 0.01, -1.7);
  terraces.add(badgeL3);

  // Plakat Lantai 1 (Ground Level)
  const badgeL1 = createFloorBadge('CLIENT LOBBY, OPS & RECEPTION', 'LEVEL 1', '#F59E0B');
  badgeL1.position.set(-6.5, 0.015, 8.2);
  terraces.add(badgeL1);

  // ══════════════════════════════════════════════════════════
  // TANGGA NAIK BERTINGKAT (Modern Floating Architectural Stairs)
  // ══════════════════════════════════════════════════════════
  const buildStaircase = (startX, startZ, startY, endZ, endY, width = 2.4, stepsCount = 3) => {
    const flight = new THREE.Group();
    const dz = (endZ - startZ) / stepsCount;
    const dy = (endY - startY) / stepsCount;

    for (let i = 0; i < stepsCount; i++) {
      const stepZ = startZ + (i + 0.5) * dz;
      const stepY = startY + (i + 1) * dy;

      // Anak tangga melayang kayu eksekutif
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.05, Math.abs(dz) * 1.05),
        M(0x283854)
      );
      step.position.set(startX, stepY - 0.025, stepZ);
      step.castShadow = true;
      step.receiveShadow = true;
      flight.add(step);

      // Lampu pendar bawah anak tangga (under-step LED strip)
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.95, 0.012, 0.02),
        MB(0x00E5FF)
      );
      strip.position.set(startX, stepY - 0.045, stepZ + dz * 0.45);
      flight.add(strip);
    }

    // Handrail samping tangga
    [-width / 2, width / 2].forEach(side => {
      const railMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.03, Math.abs(endZ - startZ) * 1.1),
        M(0xD4AF37)
      );
      railMesh.position.set(startX + side, (startY + endY) / 2 + 0.35, (startZ + endZ) / 2);
      railMesh.rotation.x = Math.atan2(endY - startY, endZ - startZ);
      flight.add(railMesh);
    });

    return flight;
  };

  // Tangga 1: Dari Lantai 1 (Y=0, Z=4.3) naik ke Lantai 2 (Y=0.22, Z=3.8)
  const stair1Left = buildStaircase(-1.8, 4.3, 0, 3.8, L2_Y, 2.0, 3);
  const stair1Right = buildStaircase(1.8, 4.3, 0, 3.8, L2_Y, 2.0, 3);
  terraces.add(stair1Left);
  terraces.add(stair1Right);

  // Tangga 2: Dari Lantai 2 (Y=0.22, Z=-0.7) naik ke Lantai 3 (Y=0.44, Z=-1.2)
  const stair2Left = buildStaircase(-1.8, -0.7, L2_Y, -1.2, L3_Y, 2.0, 3);
  const stair2Right = buildStaircase(1.8, -0.7, L2_Y, -1.2, L3_Y, 2.0, 3);
  terraces.add(stair2Left);
  terraces.add(stair2Right);

  // ══════════════════════════════════════════════════════════
  // PILAR ARSITEKTURAL GEDUNG TINGGI (High-Rise Tower Columns)
  // ══════════════════════════════════════════════════════════
  // Kolom vertikal modern berlist emas & slot LED yang mempertegas struktur bertingkat
  const addTowerColumn = (x, z) => {
    const colGroup = new THREE.Group();
    // Tiang utama
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), M(0x1F2C42));
    col.position.set(0, 2.1, 0);
    colGroup.add(col);
    // Cincin emas di level lantai 2 dan lantai 3
    [L2_Y, L3_Y].forEach(y => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.54), M(0xD4AF37));
      ring.position.set(0, y, 0);
      colGroup.add(ring);
    });
    // Slot LED vertikal
    const vLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.8, 0.52), MB(0x00F0FF));
    vLed.position.set(0, 2.1, 0);
    colGroup.add(vLed);

    colGroup.position.set(x, 0, z);
    terraces.add(colGroup);
  };

  addTowerColumn(-12.4, 3.8);  // Kolom pilar transisi L1/L2 kiri
  addTowerColumn(12.4, 3.8);   // Kolom pilar transisi L1/L2 kanan
  addTowerColumn(-12.4, -1.2); // Kolom pilar transisi L2/L3 kiri
  addTowerColumn(12.4, -1.2);  // Kolom pilar transisi L2/L3 kanan

  office.add(terraces);

  return {
    terraces,
    L2_Y,
    L3_Y,
    l2Deck,
    l3Deck,
  };
}
