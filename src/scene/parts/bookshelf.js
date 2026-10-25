// parts/bookshelf.js — builder murni RAK BUKU (dinding kiri belakang).
// Diekstrak 1:1 dari OfficeScene.js (urutan/posisi/warna identik; tampilan tak berubah).
// Pola sama cafe/serverroom/lounge: konteks di-inject, tanpa dependensi global.
export function createBookshelf({ THREE, office, M, rng, blobMat }) {
  const shelf = new THREE.Group();
  const SBX = -11.9, SBZ = -6;
  const frameB = new THREE.Mesh(new THREE.BoxGeometry(.5, 2.2, 2.4), M(0x5D4037));
  frameB.position.set(SBX, 1.1, SBZ); shelf.add(frameB);
  if (blobMat) {
    const bsShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.6), blobMat);
    bsShadow.rotation.x = -Math.PI / 2;
    bsShadow.position.set(SBX, 0.012, SBZ);
    bsShadow.renderOrder = 2;
    bsShadow.userData.blob = true;
    shelf.add(bsShadow);
  }
  const bookCols = [0xEF5350, 0xFFCA28, 0x42A5F5, 0x66BB6A, 0xAB47BC, 0xFF7043, 0x26C6DA, 0xEC407A];
  const books = [];
  for (let lvl = 0; lvl < 4; lvl++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(.48, .03, 2.3), M(0x8D6E63));
    board.position.set(SBX, .35 + lvl * .55, SBZ); shelf.add(board);
    let bz = SBZ - 1.05;
    while (bz < SBZ + 1.0) {
      const bw = .09 + rng.r(0, .07);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(.34, rng.r(.28, .4), bw), M(rng.pick(bookCols)));
      bk.position.set(SBX + .02, .35 + lvl * .55 + .17, bz + bw / 2); shelf.add(bk);
      books.push(bk);
      bz += bw + .015;
    }
  }
  office.add(shelf);
  return { shelf, books };
}
