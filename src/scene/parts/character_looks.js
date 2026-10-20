// Profil tampilan per karakter kantor (data murni, tanpa THREE).
// skin = warna kulit (hex), h = pengali tinggi sprite, acc = daftar aksesori.
// Diuji agar identitas visual karakter (aksesori/tinggi) tidak regresi.

export const LOOKS = {
  'BANTUIN AI':{skin:0xCFD8DC,h:1.0,acc:['visor','antenna']},
  'BUDI':{skin:0xD9A273,h:1.05,acc:['glasses','beard']},
  'RIZKY':{skin:0xE8B88A,h:1.02,acc:['headphones']},
  'DEWI':{skin:0xF1C9A0,h:.97,acc:['hijab']},
  'ANDI':{skin:0xC68B5E,h:1.04,acc:['cap']},
  'YOGA':{skin:0xE0AC7E,h:1.0,acc:['glasses']},
  'MAYA':{skin:0xF3D2B0,h:.96,acc:['bun','glasses']},
  'TONI':{skin:0xB97F55,h:1.07,acc:['beanie','beard']},
  'RINA':{skin:0xEBC39A,h:.97,acc:['hijab','glasses']},
  'LINA':{skin:0xF0C8A2,h:.98,acc:['ponytail']},
  'SARI':{skin:0xD9A273,h:.99,acc:['blazer','glasses']},
  'WAHYU FS':{skin:0xE8B88A,h:1.04,acc:['tie','peci']},
};

const FALLBACK = {skin:0xE8B88A,h:1,acc:[]};

// Pencarian case-insensitive berdasarkan nama agent; nama tak dikenal → fallback.
export function looksOf(agent){const L=LOOKS[String(agent?.name||'').toUpperCase()];return L?{...L,acc:[...L.acc]}:{skin:0xE8B88A,h:1,acc:[]}}
