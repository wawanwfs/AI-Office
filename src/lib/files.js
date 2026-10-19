// Penghitung file dihasilkan task. API task engine mengembalikan field `files`
// dengan bentuk tak konsisten: array, string JSON "['a.py']", string CSV, atau kosong.
// Menghitung .length mentah pada string menghasilkan jumlah KARAKTER, bukan file.
export function parseFileList(f) {
  if (Array.isArray(f)) return f
  if (typeof f !== 'string') return []
  const s = f.trim()
  if (!s || s === '[]' || s === 'null') return []
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s.replace(/'/g, '"'))
      return Array.isArray(a) ? a : [s]
    } catch { /* fallback di bawah */ }
  }
  return s.split(',').map(x => x.trim()).filter(x => x.length > 0)
}

export function fileCount(f) {
  return parseFileList(f).length
}
