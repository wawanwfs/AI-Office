// Server room (3 rak server dgn LED berkedip) + water cooler kantor WFS Project.
// Builder berbasis konteks (THREE, office, M, MB) — pola sama dgn cafe.js/decor.js.
// LED dikembalikan lewat refs.leds utk animasi blink di OfficeScene (fase & laju acak per LED).

export function createServerRoom(ctx) {
  const { THREE, office, M, MB } = ctx;
  const leds = [];
  const serverRack = (x, z) => {
    const g = new THREE.Group();
    // body cukup terang dgn garis tepi cyan supaya tidak melebur ke latar gelap
    const body = new THREE.Mesh(new THREE.BoxGeometry(.9, 2.1, .7), M(0x2E3244));
    body.position.y = 1.05; body.castShadow = true; g.add(body);
    // strip cahaya tepi: dua bar tipis di sisi kiri/kanan depan (bukan pelat penuh)
    [-.46, .46].forEach(sx => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.06, .03), MB(0x00E5FF));
      edge.position.set(sx, 1.05, .365); g.add(edge);
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
    g.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) o.castShadow = true; });
    office.add(g);
    return g;
  };
  const racks = [serverRack(1.7, -7.6), serverRack(2.8, -7.6), serverRack(3.9, -7.6)];
  // Lampu ruang server: cyan dingin + hum AC, supaya area gelap terbaca
  const light = new THREE.PointLight(0x00BCD4, .55, 6, 2);
  light.position.set(2.8, 2.6, -7.4); office.add(light);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.5, .06, .14), MB(0xB2EBF2));
  bulb.position.set(2.8, 2.9, -7.4); office.add(bulb);
  // Kabel bundel di lantai server room
  const cable = new THREE.Mesh(new THREE.BoxGeometry(3, .04, .06), M(0x333344));
  cable.position.set(2.8, .03, -7.6); office.add(cable);

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

  return { leds, racks, light, bulb, cable, cooler, wcBody, jug, tap };
}
