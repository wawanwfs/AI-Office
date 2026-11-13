// Server room (3 rak server dgn LED berkedip) + water cooler kantor WFS Project.
// Builder berbasis konteks (THREE, office, M, MB) — pola sama dgn cafe.js/decor.js.
// LED dikembalikan lewat refs.leds utk animasi blink di OfficeScene (fase & laju acak per LED).

export function createServerRoom(ctx) {
  const { THREE, office, M, MB } = ctx;
  const leds = [];
  const edges = []; // siklus 506: strip cahaya tepi rak (breath)
  const serverRack = (x, z) => {
    const g = new THREE.Group();
    // body cukup terang dgn garis tepi cyan supaya tidak melebur ke latar gelap
    const body = new THREE.Mesh(new THREE.BoxGeometry(.9, 2.1, .7), M(0x2E3244));
    body.position.y = 1.05; body.castShadow = true; g.add(body);
    // strip cahaya tepi: dua bar tipis di sisi kiri/kanan depan (bukan pelat penuh)
    [-.46, .46].forEach(sx => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.06, .03), MB(0x00E5FF));
      edge.position.set(sx, 1.05, .365); g.add(edge);
      edges.push(edge); // siklus 506: strip tepi ikut bernapas (rackEdgeBreath)
    });
    for (let u = 0; u < 8; u++) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(.8, .18, .6), M(0x3A3F55));
      unit.position.set(0, .25 + u * .23, 0); g.add(unit);
      // LED strip: 3 lampu kecil random warna
      [0x00E676, 0xFFC107, 0x2979FF].forEach((lc, li) => {
        const led = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .03), new THREE.MeshBasicMaterial({ color: lc, transparent: true }));
        led.position.set(-.22 + li * .18, .28 + u * .23, .375); // di depan muka body (z=.35) — sebelumnya .32 tertanam di dalam body, tak terlihat
        g.add(led);
        leds.push({ m: led, base: 1, ph: Math.random() * Math.PI * 2, sp: 2 + Math.random() * 6, on: .3 + Math.random() * .7 });
      });
    }
    g.position.set(x, 0, z);
    // plinth kontak: base gelap 1.0×0.06×0.8 sedikit lebih lebar dari body
    // (0.9×0.7) — transisi lantai→rak tidak lagi flat (temuan A/B kamera
    // rendah siklus 245: rak menapak tapi kontak "kering" tanpa base).
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.0, .06, .8), M(0x1A1D28));
    plinth.position.y = .03; plinth.receiveShadow = true; g.add(plinth);
    g.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.castShadow = true; });
    if (ctx.blobMat) {
      const rackShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.95), ctx.blobMat);
      rackShadow.rotation.x = -Math.PI / 2;
      rackShadow.position.set(x, 0.012, z);
      rackShadow.renderOrder = 2;
      rackShadow.userData.blob = true;
      office.add(rackShadow);
    }
    office.add(g);
    return g;
  };
  const racks = [serverRack(1.7, -7.6), serverRack(2.8, -7.6), serverRack(3.9, -7.6)];
  // Lampu ruang server: cyan dingin + hum AC, supaya area gelap terbaca
  const light = new THREE.PointLight(0x00BCD4, .55, 6, 2);
  light.position.set(2.8, 2.6, -7.4); office.add(light);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.5, .06, .14), MB(0xB2EBF2));
  bulb.position.set(2.8, 2.9, -7.4); office.add(bulb);
  // Kabel bundel di lantai server room — DI DEPAN muka rak (z=-7.15; rak
  // z=-7.6 body depth .7 → z -7.25..-7.95). Sebelumnya z=-7.6 persis sama
  // dgn pusat rak → menembus badan rak (temuan vision A/B kamera rendah
  // siklus 245: "boks kecil berpotongan ke balok besar").
  const cable = new THREE.Mesh(new THREE.BoxGeometry(3, .04, .06), M(0x333344));
  cable.position.set(2.8, .03, -7.15); office.add(cable);

  // --- WATER COOLER (kiri) ---
  const cooler = new THREE.Group();
  const wcBody = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.1, .4), M(0xE0E0E0));
  wcBody.position.y = .55; cooler.castShadow = true; cooler.add(wcBody);
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(.16, .18, .35, 10),
    new THREE.MeshLambertMaterial({ color: 0x4FC3F7, transparent: true, opacity: .7 }));
  jug.position.y = 1.28; cooler.add(jug);
  const tap = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .1), M(0x607D8B));
  tap.position.set(0, .85, .22); cooler.add(tap);
  cooler.position.set(-11.6, 0, 0); office.add(cooler);

  // ── Siklus 490: gelembung air di dalam jug — cooler jadi hidup ──
  // 3 sphere kecil biru terang transparan naik ke permukaan air (y≈1.42)
  // bergantian (siklus 1.8 dtk per gelembung, stagger fase); refs.bubbles.
  const bubbles = [];
  const BUBBLE_TOP = 1.42, BUBBLE_BOTTOM = 1.14, BUBBLE_CYCLE_SEC = 1.8;
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.025 + i * .004, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x81D4FA, transparent: true, opacity: 0 }));
    b.position.set(0, BUBBLE_BOTTOM, 0);
    b.userData = { phase: i * (BUBBLE_CYCLE_SEC / 3) };
    cooler.add(b);
    bubbles.push(b);
  }

  return { leds, edges, racks, light, bulb, cable, cooler, wcBody, jug, tap, bubbles, BUBBLE_TOP, BUBBLE_BOTTOM, BUBBLE_CYCLE_SEC };
}
