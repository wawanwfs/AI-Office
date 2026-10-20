// Footprint rintangan statis (furnitur nyata): tujuan & rute jalan tidak boleh
// berhenti DI DALAM/ATAS benda ini. Diekstrak murni agar bisa di-unit-test.
// Format: [x0, x1, z0, z1].
export const OBSTACLES = [
  [-11.6, -9.5, 2.2, 2.9],    // counter pantry (furniture.js z 2.5, w 1.7)
  [-10.8, -10.2, -0.3, 0.3],  // dispenser air
  [2.5, 3.5, -8.4, -7.5],     // printer
  [-11.4, -6.9, 6.2, 9.4],    // zona café: counter L (CFX -9.5), stools z 8.5, fridge (-7, 7.3)
  [8.0, 12.4, 4.3, 9.4],      // lounge: sofa (10.5,6), coffee table, armchairs, lamp, magRack
];

export const inObstacle = (x, z) =>
  OBSTACLES.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

// Titik dalam zona meja+kursi agent (±0.9) yang dihuni. agents = agentData
// (entri {agent, home:{x,z}, state}); selfAgent = objek agent pemilik target.
export const seatOccupied = (x, z, agents, selfAgent) =>
  agents.some((o) => o.agent !== selfAgent && o.state !== 'offsite' && Math.hypot(o.home.x - x, o.home.z - z) < 0.9);
