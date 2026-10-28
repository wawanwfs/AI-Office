// Fase kantor (workspace phase) — murni & diuji unit.
// Sumber kebenaran TUNGGAL: scene memanggil onStatusUpdate(statusAt(min)) —
// label fase dari SCHEDULE daycycle.js (12 fase jam simulasi) — dan App
// meneruskannya ke HUD sebagai prop `phase` (string label).
// Modul ini HANYA memetakan label → TONE (kelas CSS chip HUD) + ikon, TANPA
// menduplikasi tabel jam: menghitung ulang fase dari menit di UI berisiko
// desinkron dgn scene (dua sumber kebenaran). Label tak dikenal tetap tampil
// dgn tone generik (scene tetap sumber kebenaran), bukan disembunyikan.

const PHASE_STYLE = {
  'Shift malam · WFS online': { tone: 'night', icon: '☾' },
  'Persiapan pagi': { tone: 'dawn', icon: '◔' },
  'Tim mulai berdatangan': { tone: 'dawn', icon: '◔' },
  'Fokus pagi': { tone: 'work', icon: '●' },
  'Stand-up pagi': { tone: 'meet', icon: '◆' },
  'Deep work · semua online': { tone: 'work', icon: '●' },
  'Istirahat makan siang': { tone: 'break', icon: '◔' },
  'Fokus siang': { tone: 'work', icon: '●' },
  'Sprint review': { tone: 'meet', icon: '◆' },
  'Fokus sore': { tone: 'work', icon: '●' },
  'Tim bersiap pulang': { tone: 'dusk', icon: '◑' },
};

const FALLBACK = { tone: 'dim', icon: '●' };

// tone+ikon utk label fase; anti-poisoning: input non-string / kosong → null
// (chip tak dirender), BUKAN fallback — scene belum lapor ≠ fase ada.
export function phaseStyleFor(label) {
  if (typeof label !== 'string' || !label.trim()) return null;
  const style = PHASE_STYLE[label];
  if (style) return { label, tone: style.tone, icon: style.icon };
  return { label: label.trim(), tone: FALLBACK.tone, icon: FALLBACK.icon };
}
