// Pemangkas teks di batas KATA terakhir + '…' (dipakai lintas UI, bukan hanya scene)
export function clip(s, n) {
  if (!s || s.length <= n) return s || ''
  const cut = s.slice(0, n)
  const sp = cut.lastIndexOf(' ')
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}
