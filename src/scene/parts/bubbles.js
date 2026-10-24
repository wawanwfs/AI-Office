// Update bubble obrolan: fade-in cepat, fade-out di akhir, mengikuti anchor
// pembicara secara MULUS (bukan snap). Dulu posisi x/z/y langsung di-set = posisi
// anchor tiap tick → setiap agent berpindah/pindah state (duduk↔jalan) bubble
// terlihat "melompat". Kini approach eksponensial pada x/z dan BASE y:
// drift float-up (3-life)*.10 tetap diterapkan langsung (tidak boleh lag),
// hanya baseline tinggi (anchor.y+1.35) yang dihaluskan — transisi duduk↔berdiri
// jadi geser halus, bukan lompat. k=1 saat delta besar → tetap sampai tanpa lag
// saat frame drop. Diekstrak murni agar bisa di-unit-test.
export const BUBBLE_SMOOTH_RATE = 10; // 1/dtk — konvergensi ±0.3 dtk, tanpa snap

export function updateBubbles(bubbles, delta, { remove }){
  const k = 1 - Math.exp(-BUBBLE_SMOOTH_RATE * Math.max(0, delta));
  for(let i=bubbles.length-1;i>=0;i--){
    const b=bubbles[i];
    b.life-=delta;
    if(b.anchor){ // ikuti pembicara secara mulus (tidak melompat antar posisi)
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
