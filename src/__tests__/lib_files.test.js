// Unit test lib/files.js (parseFileList/fileCount) — parser nomor file hasil task
// yang menerima bentuk tak konsisten: array, string JSON, string CSV, atau kosong.
// Murni: tanpa DOM/fetch — bisa jalan di environment node.
import { describe, it, expect } from 'vitest'
import { parseFileList, fileCount } from '../lib/files.js'

describe('parseFileList — array', () => {
  it('array kosong → []', () => {
    expect(parseFileList([])).toEqual([])
  })
  it('array string polos dipetakan apa adanya', () => {
    expect(parseFileList(['a.py', 'b.js'])).toEqual(['a.py', 'b.js'])
  })
  it('item kosong/null/falsy dibuang', () => {
    expect(parseFileList(['a.py', '', null, undefined, '  '])).toEqual(['a.py'])
  })
  it('item berkutip pembungkus dibersihkan', () => {
    expect(parseFileList(["'a.py'", '"b.py"'])).toEqual(['a.py', 'b.py'])
  })
})

describe('parseFileList — non-string', () => {
  it.each([[null], [undefined], [42], [true], [{}]])('input %p → []', (v) => {
    expect(parseFileList(v)).toEqual([])
  })
})

describe('parseFileList — string', () => {
  it('kosong / spasi → []', () => {
    expect(parseFileList('')).toEqual([])
    expect(parseFileList('   ')).toEqual([])
  })
  it("'[]' dan 'null' → []", () => {
    expect(parseFileList('[]')).toEqual([])
    expect(parseFileList('null')).toEqual([])
  })
  it("JSON array string pakai kutip tunggal → array", () => {
    expect(parseFileList("['a.py', 'b.py']")).toEqual(['a.py', 'b.py'])
  })
  it("JSON array string satu item → array", () => {
    expect(parseFileList("['a.py']")).toEqual(['a.py'])
  })
  it('CSV polos dipisah koma', () => {
    expect(parseFileList('a.py,b.py,c.js')).toEqual(['a.py', 'b.py', 'c.js'])
  })
  it('CSV spasi setelah koma di-trim', () => {
    expect(parseFileList('a.py, b.py')).toEqual(['a.py', 'b.py'])
  })
  it('koma DI DALAM kutip tidak memecah item', () => {
    expect(parseFileList("'a, b.py', 'c.py'")).toEqual(['a, b.py', 'c.py'])
  })
  it('kutip ganda juga dilindungi', () => {
    expect(parseFileList('"a, b.py", "c.py"')).toEqual(['a, b.py', 'c.py'])
  })
  it('bracket sisa dibersihkan dari tepi item', () => {
    expect(parseFileList('[a.py, b.py]')).toEqual(['a.py', 'b.py'])
  })
  it('kutip yatim di tepi dibersihkan', () => {
    expect(parseFileList("'a.py'")).toEqual(['a.py'])
  })
})

describe('fileCount', () => {
  it('array → jumlah item valid', () => {
    expect(fileCount(['a.py', '', 'b.py'])).toBe(2)
  })
  it('string JSON → jumlah item', () => {
    expect(fileCount("['a.py', 'b.py', 'c.py']")).toBe(3)
  })
  it('JSON standar kutip ganda → jumlah item', () => {
    expect(fileCount('["x.go"]')).toBe(1)
  })
  it('string tunggal tanpa koma = 1 file', () => {
    expect(fileCount('main.py')).toBe(1)
  })
  it('CSV → jumlah item', () => {
    expect(fileCount('a.py,b.py')).toBe(2)
  })
  it('JSON rusak fallback ke CSV', () => {
    expect(fileCount("['a.py', 'b.py")).toBe(2)
  })
  it('koma dalam kutip tidak salah pecah', () => {
    expect(fileCount("['a, b.py','c.py']")).toBe(2)
  })
  it('array item berkutip dibersihkan', () => {
    expect(fileCount(["'a.py'", '"b.js"'])).toBe(2)
  })
  it('bukan array/string (angka) → 0', () => {
    expect(fileCount(42)).toBe(0)
    expect(fileCount(true)).toBe(0)
  })
  it('kosong → 0', () => {
    expect(fileCount('')).toBe(0)
    expect(fileCount(null)).toBe(0)
  })
})
