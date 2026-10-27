// Update bubble obrolan: fade-in cepat, fade-out di akhir, mengikuti anchor
// pembicara secara MULUS (bukan snap). Dulu posisi x/z/y langsung di-set = posisi
// anchor tiap tick → setiap agent berpindah/pindah state (duduk↔jalan) bubble
// terlihat "melompat". Kini approach eksponensial pada x/z dan BASE y:
// drift float-up (3-life)*.10 tetap diterapkan langsung (tidak boleh lag),
// hanya baseline tinggi (anchor.y+1.35) yang dihaluskan — transisi duduk↔berdiri
// jadi geser halus, bukan lompat. k=1 saat delta besar → tetap sampai tanpa lag
// saat frame drop. Diekstrak murni agar bisa di-unit-test.
const BUBBLE_SMOOTH_RATE = 10; // 1/dtk — konvergensi ±0.3 dtk, tanpa snap

// Buang resource GPU/VRAM bubble yang dihapus: map tekstur (CanvasTexture)
// SEBELUM material — dulu hanya material.dispose() → tekstur 360×76 bocor
// di VRAM selamanya (autoTalk ~8 dtk + chat pasangan + klik papan; kantor
// display jalan berhari-hari menumpuk ribuan tekstur mati). Sprite tetap
// dilepas dari scene oleh pemanggil; di sini cukup resource-nya.
// Null-safe: material/map bisa sudah di-dispose pihak lain atau tak ada.
export function disposeBubble(b) {
  const m = b && b.sprite && b.sprite.material;
  if (m) {
    if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
    if (typeof m.dispose === 'function') m.dispose();
  }
}

export function updateBubbles(bubbles, delta, { remove }){
  // Guard anti-poisoning (konsisten dgn pola modul lain): timestep non-finite
  // (NaN/±Infinity) TIDAK boleh menulari bubble — Math.exp(NaN)=NaN → posisi/
  // opacity bubble jadi NaN & hilang diam-diam. Perlakukan sebagai 0 (no-op aman).
  if (!Number.isFinite(delta)) delta = 0;
  const k = 1 - Math.exp(-BUBBLE_SMOOTH_RATE * Math.max(0, delta));
  for(let i=bubbles.length-1;i>=0;i--){
    const b=bubbles[i];
    // Guard anti-poisoning: life bubble rusak (NaN/±Infinity) → perlakukan sbg
    // habis (0) supaya lewat jalur hapus di bawah — tanpa ini NaN merambat ke
    // opacity/posisi (bubble tak terlihat) & life<=0 selalu false → tak pernah
    // dihapus (bocor selamanya).
    if (!Number.isFinite(b.life)) b.life = 0;
    b.life-=delta;
    // Guard anti-poisoning: anchor korup (koordinat non-finite/hilang) → jangan
    // ikuti (posisi jadi NaN & sprite terbang ke koordinat rusak) — fallback ke
    // melayang naik dari startY (branch tanpa anchor).
    const anchorOk = !!b.anchor &&
      Number.isFinite(b.anchor.x) && Number.isFinite(b.anchor.z) &&
      (b.anchor.y === undefined || Number.isFinite(b.anchor.y));
    if(anchorOk){ // ikuti pembicara secara mulus (tidak melompat antar posisi)
      b.sprite.position.x+=(b.anchor.x-b.sprite.position.x)*k;
      b.sprite.position.z+=(b.anchor.z-b.sprite.position.z)*k;
      const baseT=(b.anchor.y||2.0)+1.35;          // anchor.y=2.6 (berdiri) / 1.4 (ngobrol)
      b.baseY=(b.baseY===undefined?baseT:b.baseY)+(baseT-(b.baseY===undefined?baseT:b.baseY))*k;
      b.sprite.position.y=b.baseY+(3-b.life)*.10;  // drift float-up langsung
    } else {
      b.sprite.position.y=b.startY+(3-b.life)*.12; // float up
    }
    const age=3.5-b.life;
    b.sprite.material.opacity=Math.min(1,age/.22)*Math.max(0,Math.min(1,b.life/.5));
    if(b.life<=0){
      remove(b);
      bubbles.splice(i,1);
    }
  }
}
