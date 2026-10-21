// Painter kanvas lantai & AO dinding — murni (ctx di-inject, tanpa THREE/DOM).
// Diekstrak dari OfficeScene; urutan & parameter perintah gambar identik
// kode inline lama (tampilan tak berubah).

// lantai parket kayu prosedural 512×512: 10 baris papan dengan lebar & shade
// deterministik (hash dari r dan x) + garis nat + top coat gradien
export function drawWoodFloor(x) {
  x.fillStyle = '#8A7C68'; x.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 10; r++) {
    const y = r * 52; let x0 = (r % 2) * -60;
    while (x0 < 512) {
      const w = 120 + ((r * 97 + x0) % 90);
      const shade = 112 + ((r * 53 + x0 * 7) % 30);
      x.fillStyle = `rgb(${shade},${shade - 18},${shade - 45})`;
      x.fillRect(x0 + 2, y + 2, w - 3, 48);
      x.fillStyle = 'rgba(90,70,50,0.25)';
      x.fillRect(x0 + 2, y + 2, w - 3, 2);
      x0 += w;
    }
  }
}

// strip AO kontak pangkal dinding 16×64: gradien gelap → transparan
export function drawAoStrip(x) {
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.52)'); g.addColorStop(.45, 'rgba(0,0,0,0.24)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 16, 64);
}
