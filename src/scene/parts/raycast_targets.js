// Target raycast interaksi (pilih agen / fokus papan proyek / whiteboard / nexus) —
// diekstrak dari OfficeScene.js yang sebelumnya membangun daftar target ini SECARA
// DUPlikat di 3 call site (pointerup klik, dblclick, hover pointermove).
//
// Murni (tanpa THREE): menerima kandidat primitif (agentData, board, whiteboard,
// nexus) dan mengembalikan array object untuk `ray.intersectObjects(list, true)`.
// Urutan: agen → papan proyek → whiteboard → nexus (urutan tak memengaruhi
// intersectObjects yang mengurutkan berdasar jarak, tapi dipertahankan stabil).

/**
 * Kumpulkan target raycast dari state scene.
 * @param {object} src
 * @param {Array<{sittingChar:THREE.Object3D, walker:THREE.Object3D}>} src.agentData
 * @param {{mesh?:THREE.Object3D, frame?:THREE.Object3D}|null} src.board   papan proyek (window.__projectBoard)
 * @param {{mesh?:THREE.Object3D, frame?:THREE.Object3D}|null} src.whiteboard
 * @param {THREE.Object3D|null} src.nexus  karakter nexus (disertakan bila visible!==false)
 * @param {Array<THREE.Object3D>} [src.meetingFigures]  figur peserta rapat yang
 *   sedang TAMPIL (createMeeting.figures — dulu TIDAK disertakan: klik pada
 *   peserta rapat jatuh ke jalur "klik kosong" → kamera me-reset ke rumah
 *   [regresi siklus 119])
 * @returns {Array<THREE.Object3D>} target intersect
 */
export function collectPickTargets(src) {
  const s = src || {};
  const agents = Array.isArray(s.agentData) ? s.agentData : [];
  const targets = [];
  agents.forEach(ad => {
    if (ad && ad.sittingChar && ad.sittingChar.visible) targets.push(ad.sittingChar);
    if (ad && ad.walker && ad.walker.visible) targets.push(ad.walker);
  });
  const board = s.board || null;
  if (board && board.mesh) targets.push(board.mesh);
  if (board && board.frame) targets.push(board.frame);
  const wb = s.whiteboard || null;
  if (wb && wb.mesh) targets.push(wb.mesh);
  if (wb && wb.frame) targets.push(wb.frame);
  if (s.nexus && s.nexus.visible !== false) targets.push(s.nexus);
  if (Array.isArray(s.meetingFigures)) {
    s.meetingFigures.forEach(f => { if (f && f.visible) targets.push(f); });
  }
  return targets;
}

/**
 * Objek yang kena ray termasuk anakan (anak karakter/kartu)? Cari root agen:
 * telusuri rantai parent sampai menemukan sittingChar/walker milik agentData.
 * @param {THREE.Object3D} obj            object hasil intersect (hits[0].object)
 * @param {Array<{sittingChar,walker}>} agentData
 * @returns {object|null} entri agentData pemilik objek, atau null
 */
export function findAgentRoot(obj, agentData) {
  const agents = Array.isArray(agentData) ? agentData : [];
  if (!obj) return null;
  // sama dengan semula: cek langsung dulu, lalu naik rantai parent
  for (const ad of agents) {
    if (ad.sittingChar === obj || ad.walker === obj) return ad;
  }
  let p = obj.parent;
  while (p) {
    for (const ad of agents) {
      if (ad.sittingChar === p || ad.walker === p) return ad;
    }
    p = p.parent;
  }
  return null;
}

/**
 * Objek yang kena ray adalah nexus (termasuk anakan)?
 * @param {THREE.Object3D} obj
 * @param {THREE.Object3D|null} nexus
 * @returns {boolean}
 */
export function isNexusHit(obj, nexus) {
  if (!obj || !nexus) return false;
  if (obj === nexus) return true;
  return !!(nexus.getObjectById && nexus.getObjectById(obj.id));
}

/**
 * Figur peserta rapat (createMeeting.figures) yang kena ray — telusuri rantai
 * parent sampai menemukan salah satu figur. Return { index, figure } pemilik
 * objek, atau null. Dulu figur peserta rapat TIDAK bisa diklik sama sekali:
 * tak ada di daftar raycast & tak ada pemetaan hit→agen [regresi siklus 119].
 * @param {THREE.Object3D} obj            object hasil intersect (hits[0].object)
 * @param {Array<THREE.Object3D>} figures daftar figur peserta (urutan = agentData)
 * @returns {{index:number, figure:THREE.Object3D}|null}
 */
export function findMeetingFigureOwner(obj, figures) {
  if (!obj || !Array.isArray(figures) || figures.length === 0) return null;
  let p = obj;
  while (p) {
    const idx = figures.indexOf(p);
    if (idx !== -1) return { index: idx, figure: p };
    p = p.parent;
  }
  return null;
}

/**
 * Objek yang kena ray adalah papan proyek (mesh/frame, termasuk anakan frame)?
 * @param {THREE.Object3D} obj
 * @param {{mesh?, frame?}|null} board
 * @returns {boolean}
 */
export function isBoardHit(obj, board) {
  if (!obj || !board) return false;
  if (board.mesh && obj === board.mesh) return true;
  const f = board.frame;
  if (f && (obj === f || (f.getObjectById && f.getObjectById(obj.id)))) return true;
  return false;
}
