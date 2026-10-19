// Penghitung file dihasilkan task. API task engine mengembalikan field `files`
// dengan bentuk tak konsisten: array, string JSON "['a.py']", string CSV, atau kosong.
// Menghitung .length mentah pada string menghasilkan jumlah KARAKTER, bukan file.
export function parseFileList(f) {
  if (Array.isArray(f)) return f.map(cleanItem).filter(Boolean)
  if (typeof f !== 'string') return []
  const s = f.trim()
  if (!s || s === '[]' || s === 'null') return []
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s.replace(/'/g, '"'))
      if (Array.isArray(a)) return a.map(cleanItem).filter(Boolean)
    } catch { /* fallback di bawah */ }
  }
  return splitCsv(s).map(cleanItem).filter(Boolean)
}

// Bersihkan satu item: buang kutip pembungkus dan bracket sisa ('a.py' → a.py).
function cleanItem(x) {
  let t = String(x ?? '').trim()
  // strip pasangan kutip pembungkus, berulang ("'a'" → a)
  while (t.length > 1 && ((t[0] === "'" && t.at(-1) === "'") || (t[0] === '"' && t.at(-1) === '"'))) t = t.slice(1, -1).trim()
  // strip bracket pembungkus sisa ('[a.py' → a.py) dan kutip yatim di tepi
  while (t.length > 1 && (t[0] === '[' || t[0] === "'" || t[0] === '"')) t = t.slice(1).trim()
  while (t.length > 1 && (t.at(-1) === ']' || t.at(-1) === "'" || t.at(-1) === '"')) t = t.slice(0, -1).trim()
  return t
}

// Split CSV yang sadar kutip: koma DI DALAM kutip tidak memecah item.
// ("'a, b.py', 'c.py'" → ["'a, b.py'", " 'c.py'"])
function splitCsv(s) {
  const out = []
  let cur = '', q = null
  for (const ch of s) {
    if (q) {
      cur += ch
      if (ch === q) q = null
    } else if (ch === "'" || ch === '"') {
      q = ch; cur += ch
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export function fileCount(f) {
  return parseFileList(f).length
}
