// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { fileCount, parseFileList } from '../lib/files'

describe('fileCount', () => {
  it('array tetap dihitung per elemen', () => expect(fileCount(['a.py', 'b.js'])).toBe(2))
  it('string JSON gaya Python di-parse', () => expect(fileCount("['a.py','b.py','c.py']")).toBe(3))
  it('string JSON standar', () => expect(fileCount('["x.go"]')).toBe(1))
  it('string CSV dihitung per item', () => expect(fileCount('a.py, b.py')).toBe(2))
  it('kosong / null / [] / bukan string-array => 0', () => {
    expect(fileCount('')).toBe(0)
    expect(fileCount('[]')).toBe(0)
    expect(fileCount(null)).toBe(0)
    expect(fileCount(undefined)).toBe(0)
    expect(fileCount(42)).toBe(0)
  })
  it('string tunggal tanpa koma = 1 file', () => expect(fileCount('main.py')).toBe(1))
  it('JSON rusak fallback ke CSV', () => expect(fileCount("['a.py', 'b.py")).toBe(2))
})

describe('parseFileList', () => {
  it('mengembalikan array bersih tanpa whitespace', () => expect(parseFileList(' a.py, b.py ')).toEqual(['a.py', 'b.py']))
  it('string kosong/[]/null => array kosong', () => {
    expect(parseFileList('[]')).toEqual([])
    expect(parseFileList('null')).toEqual([])
    expect(parseFileList(42)).toEqual([])
  })
  it('JSON rusak fallback CSV per item', () => expect(parseFileList("['a.py', 'b.py")).toEqual(["['a.py'", "'b.py"]))
})
