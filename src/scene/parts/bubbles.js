// Update bubble obrolan: fade-in cepat, fade-out di akhir, mengikuti anchor
// pembicara (tidak melompat antar posisi). Diekstrak murni agar bisa di-unit-test.
export function updateBubbles(bubbles, delta, { remove }){
  for(let i=bubbles.length-1;i>=0;i--){
    const b=bubbles[i];
    b.life-=delta;
    if(b.anchor){ // ikuti pembicara: tidak melompat antar posisi
      b.sprite.position.x=b.anchor.x;
      b.sprite.position.z=b.anchor.z;
      b.sprite.position.y=(b.anchor.y||2.0)+1.35+(3-b.life)*.10; // anchor.y=2.6 (berdiri) / 1.4 (ngobrol)
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
