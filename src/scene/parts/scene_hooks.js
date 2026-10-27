// Higiene hook window milik scene 3D (siklus 123 — jalur destroy/remount/HMR).
//
// Konteks bug: createOfficeScene memasang ±45 hook window.__* (debug/e2e +
// integrasi UI React: __agentData, __cam, __renderer, __zoneLabels,
// __wallFade, __meetFigs, …). destroy() lama hanya menghapus 10 di antaranya
// → puluhan hook tetap menunjuk graph scene MATI setelah remount/HMR:
//   - heap terkunci (agentData/figur rapat/screens tak ter-GC),
//   - SysMeter membaca hitungan agen BASI tiap 4 dtk dari scene lama,
//   - probe E2E bisa "sukses" membaca scene lama yang seharusnya gugur.
//
// Daftar ini SATU sumber kebenaran: dipakai purgeSceneHooks() di destroy()
// dan terekspos via window.__SCENE_HOOKS agar probe E2E dapat memverifikasi
// cakupan (hook scene baru yang lupa didaftarkan → probe FAIL).
//
// PEMILIK LAIN — JANGAN didaftarkan (bukan milik scene):
//   __wfsAgentIdList / __wfsSceneSelect / __wfsSelectAgent (App.jsx & panel React),
//   __wfsModalOpen / __escModalAtDispatch / __openSettings (App),
//   __officeSceneDestroyed (flag lintas-scene, sengaja bertahan — dibaca audio_wake),
//   THREE (global library, bukan state scene).

export const SCENE_HOOKS = [
  // graph & runtime scene
  '__scene', '__agentData', '__screens', '__bubbles', '__bubbleCount',
  '__lastBubble', '__lastBubbleAt', '__meetFigs', '__collabCount', '__collabLast',
  '__animFrames', '__perf', '__labelFrac',
  // kamera & renderer
  '__cam', '__camCam', '__renderer', '__spawnBubble', '__resizeScene',
  // pilihan & cincin
  '__sceneSelRing', '__sceneRing',
  // aksi dari UI React / debug API
  '__focusTeam', '__focusAgent', '__focusMeetingRoom', '__setTime',
  '__toggleNeon', '__openTaskBoard', '__whiteboard', '__projectBoard',
  // status debug & poll
  '__dbg', '__meet', '__lunch', '__pollBadges', '__wfsAgentIdMap',
  '__wfsRunningTasks',
  // audio
  '__officeSound', '__audio',
  // dinding & zona (parts/walls.js, parts/flooring.js)
  '__wallFade', '__wallState', '__wallLast', '__corners',
  '__zoneLabels', '__zoneBase',
  // TV lounge & whiteboard (parts/lounge.js, parts/room.js)
  '__tvCanvas', '__tvData', '__lastTvDrawAt', '__tvPullErr', '__lastWbDrawAt',
  // controls scene utuh (jembatan destroy/probe E2E — memegang seluruh closure)
  '__wfsSceneControls',
  // ekspos utk probe E2E (verifikasi cakupan purge — siklus 123)
  '__SCENE_HOOKS', '__sceneHygienePurge',
];

// Hapus semua hook scene dari window. Murni (win di-inject) agar diuji unit;
// idempoten — hook yang sudah tidak ada diabaikan tanpa error.
// Return daftar nama yang BENAR-BENAR terhapus (ada sebelumnya).
export function purgeSceneHooks(win, hooks = SCENE_HOOKS) {
  if (!win || typeof win !== 'object' || !Array.isArray(hooks)) return [];
  const purged = [];
  hooks.forEach((k) => {
    if (typeof k !== 'string' || !k) return;
    if (Object.prototype.hasOwnProperty.call(win, k)) {
      try { delete win[k]; purged.push(k); } catch { /* abaikan: properti non-konfigurable */ }
    }
  });
  return purged;
}
