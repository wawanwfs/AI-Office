// Deteksi percakapan dekat (water-cooler chat) — diekstrak murni dari
// checkConversations (OfficeScene.js) agar bisa di-unit-test. Tanpa THREE/DOM.
//
// Kontrak: daftar "orang" {x, z, visible, cooldown} → pasangan (a,b) yang
// saling dekat (jarak < radius) dan KEDUANYA bebas cooldown.

export const CHAT_RADIUS = 1.5;      // jarak maksimum bicara (satuan dunia)
export const CHAT_COOLDOWN_SEC = 8;  // jeda bicara setelah chat (detik NYATA)

// Semua pasangan i<j yang saling dekat & tidak sedang cooldown.
// visible=false (walker disembunyikan, duduk/offsite) tidak pernah ikut.
export function nearbyPairs(ppl, radius = CHAT_RADIUS) {
  const out = [];
  for (let i = 0; i < ppl.length; i++) {
    const a = ppl[i];
    if (!a.visible) continue;
    for (let j = i + 1; j < ppl.length; j++) {
      const b = ppl[j];
      if (!b.visible) continue;
      if ((a.cooldown || 0) > 0 || (b.cooldown || 0) > 0) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) < radius) out.push([a, b]);
    }
  }
  return out;
}

// Turunkan cooldown dengan delta DETIK (bukan per-frame konstan — bug lama
// memakai 0.016/frame sehingga di GPU lambat agent terkunci bermenit-menit).
export function tickCooldown(cd, delta) {
  return Math.max(0, (cd || 0) - delta);
}
