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

// terazzo 512x512: latar netral + chip organik deterministik + vena marmer halus + nat grid tipis
export function drawTerrazzo(x, tint = '#FFFFFF') {
  x.fillStyle = tint === '#FFFFFF' ? '#EDEAE3' : tint;
  x.fillRect(0, 0, 512, 512);
  const chips = ['#D9CFC0', '#C4B8A5', '#B0A48F'];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 260; i++) {
    x.fillStyle = chips[i % chips.length];
    x.globalAlpha = 0.5 + rnd() * 0.4;
    const cx = rnd() * 512, cy = rnd() * 512, r = 1.5 + rnd() * 4;
    x.beginPath(); x.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.6), rnd() * 3.14, 0, 6.29); x.fill();
  }
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(120,110,95,0.16)'; x.lineWidth = 1.4;
  for (let v = 0; v < 5; v++) {
    x.beginPath(); let vx = rnd() * 512, vy = 0; x.moveTo(vx, vy);
    while (vy < 512) { vy += 30 + rnd() * 40; vx += (rnd() - 0.5) * 60; x.lineTo(vx, vy); }
    x.stroke();
  }
  x.strokeStyle = 'rgba(90,85,75,0.10)'; x.lineWidth = 1;
  for (let g = 0; g <= 512; g += 128) {
    x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 512); x.stroke();
    x.beginPath(); x.moveTo(0, g); x.lineTo(512, g); x.stroke();
  }
}
