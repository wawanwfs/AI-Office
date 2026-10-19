// Penghitung file dihasilkan task. API task engine mengembalikan field `files`
// dengan bentuk tak konsisten: array, string JSON "['a.py']", string CSV, atau kosong.
// Menghitung .length mentah pada string menghasilkan jumlah KARAKTER, bukan file.
export function fileCount(f) {
  if (Array.isArray(f)) return f.length
  if (typeof f !== 'string') return 0
  const s = f.trim()
  if (!s || s === '[]' || s === 'null') return 0
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s.replace(/'/g, '"'))
      return Array.isArray(a) ? a.length : 1
    } catch { /* fallback di bawah */ }
  }
  return s.split(',').filter(x => x.trim().length > 0).length
}
