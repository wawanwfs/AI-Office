// lib/sfx.js — satu sumber pemanggil SFX scene (siklus 351).
//
// window.__officeSound di-set OfficeScene setelah engine audio dibuat
// (sound_engine.js). Dulu TaskBoard membungkus SETIAP pemanggil dgn guard
// inline `typeof window !== 'undefined' && window.__officeSound` (28 salinan
// — pelajaran 333: salinan drift & rawan beda perilaku). Kini guard + keber-
// adaan method + optional-call ada di sini; pemanggil cukup sfx.playSelect().
//
// Anti-poisoning: method yang tak ada / engine mati / lempar → no-op aman
// (return false), bukan crash panel task.

const call = (method, ...args) => {
  if (typeof window === 'undefined') return false
  const s = window.__officeSound
  if (!s || typeof s[method] !== 'function') return false
  try { s[method](...args); return true } catch { return false }
}

export const sfx = {
  playSelect: () => call('playSelect'),
  playCardPickup: () => call('playCardPickup'),
  playCardDrop: () => call('playCardDrop'),
  playTaskDone: () => call('playTaskDone'),
  playTaskUrgent: () => call('playTaskUrgent'),
}

// Drop kartu kanban: done → nada selesai, urgent → nada urgen, sisanya nada
// drop (fallback select). Satu sumber rantai prioritas ini (dulu salinan
// if/else inline di handleDrop TaskBoard).
export function playDropFor(task) {
  if (task && task.status === 'done') return sfx.playTaskDone()
  if (task && task.priority === 'urgent') return sfx.playTaskUrgent()
  return (sfx.playCardDrop() || sfx.playSelect())
}
