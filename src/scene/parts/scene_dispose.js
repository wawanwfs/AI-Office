// Pelepasan graph scene 3D (siklus 124 — jalur destroy/remount/HMR).
//
// Konteks bug: destroy() sebelum siklus 124 melepas konteks WebGL
// (forceContextLoss, siklus 123) dan purge hook window (siklus 123), tapi
// TIDAK PERNAH men-dispose geometri/material/tekstur graph scene. Semua
// typed-array atribut (position/normal/uv), uniform material, dan CanvasTexture
// (label zona, layar, papan proyek, TV, poster, langit, …) tetap hidup di JS
// heap SELAMA ada referensi — dan selama purge belum membuat semuanya tak
// terjangkau, heap terkunci. Setelah purge hook, graph memang jadi sampah yang
// bisa di-GC — tapi dispose() eksplisit tetap benar: (1) memutus cache internal
// renderer/onBeforeCompile lebih awal, (2) melepas sumber daya deterministik
// tanpa menunggu GC (display kiosk remount berulang), (3) menyediakan angka
// terukur (jumlah geometri/material/tekstur yang dibuang) utk probe E2E.
//
// Murni & null-safe: root di-inject, tanpa import THREE (deteksi via flag
// isGeometry/isMaterial/isTexture milik three), idempoten — objek yang sudah
// di-dispose diabaikan (dispose() three aman dipanggil ulang).

// Kumpulkan & dispose semua sumber daya graph. Return hitungan:
// { geometries, materials, textures } — jumlah objek unik yang benar-benar
// di-dispose (bukan jumlah mesh; geometri/material dipakai bersama dihitung 1×).
export function disposeSceneGraph(root) {
  if (!root || typeof root.traverse !== 'function') {
    return { geometries: 0, materials: 0, textures: 0 };
  }
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const isObj = (v) => v && typeof v === 'object';
  try {
    root.traverse((node) => {
      if (!isObj(node)) return;
      const g = node.geometry;
      if (isObj(g) && typeof g.dispose === 'function') geometries.add(g);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (!isObj(m) || typeof m.dispose !== 'function') continue;
        materials.add(m);
        // Tekstur bisa duduk di slot material apa pun (map, alphaMap,
        // emissiveMap, envMap, …) — pindai semua nilai milik material.
        for (const key of Object.keys(m)) {
          const t = m[key];
          if (isObj(t) && t.isTexture && typeof t.dispose === 'function') textures.add(t);
        }
      }
    });
  } catch { /* traverse gagal (graph korup) — kembalikan hitungan parsial */ }
  let ng = 0, nm = 0, nt = 0;
  geometries.forEach((g) => { try { g.dispose(); ng++; } catch { /* abaikan */ } });
  materials.forEach((m) => { try { m.dispose(); nm++; } catch { /* abaikan */ } });
  textures.forEach((t) => { try { t.dispose(); nt++; } catch { /* abaikan */ } });
  return { geometries: ng, materials: nm, textures: nt };
}
