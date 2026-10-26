// Parser daftar file hasil task (src/lib/files.js) — murni.
// API task engine mengembalikan `files` dgn bentuk tak konsisten:
// array, string JSON "['a.py']", string CSV, atau kosong → parseFileList
// menormalkannya jadi array string bersih (data jumlah file akurat).
import { describe, it, expect } from 'vitest';
import { parseFileList, fileCount } from '../lib/files.js';

describe('parseFileList — array', () => {
  it('array string: trim tiap item & buang kosong', () => {
    expect(parseFileList(['a.py', ' b.py '])).toEqual(['a.py', 'b.py']);
  });
  it('item kosong/null di array dibuang', () => {
    expect(parseFileList(['a.py', '', null, undefined])).toEqual(['a.py']);
  });
});

describe('parseFileList — string JSON array', () => {
  it("'['a.py', 'c.py']' → array", () => {
    expect(parseFileList("['a.py', 'c.py']")).toEqual(['a.py', 'c.py']);
  });
  it('JSON ganda kutip juga diterima', () => {
    expect(parseFileList('["a.py", "b.py"]')).toEqual(['a.py', 'b.py']);
  });
  it('JSON rusak → fallback CSV (tidak throw)', () => {
    expect(parseFileList("['a.py', 'c.py'")).toEqual(['a.py', 'c.py']);
  });
});

describe('parseFileList — string CSV', () => {
  it('CSV sederhana dipisah koma', () => {
    expect(parseFileList('a.py, b.py')).toEqual(['a.py', 'b.py']);
  });
  it('koma DI DALAM kutip tidak memecah item', () => {
    expect(parseFileList("'a, b.py', 'c.py'")).toEqual(['a, b.py', 'c.py']);
  });
  it('kutip pembungkus dilepas', () => {
    expect(parseFileList("'a.py'")).toEqual(['a.py']);
    expect(parseFileList('"a.py"')).toEqual(['a.py']);
  });
});

describe('parseFileList — kosong / non-string', () => {
  it('string kosong, "[]", "null" → []', () => {
    expect(parseFileList('')).toEqual([]);
    expect(parseFileList('[]')).toEqual([]);
    expect(parseFileList('null')).toEqual([]);
  });
  it('null / undefined / angka → []', () => {
    expect(parseFileList(null)).toEqual([]);
    expect(parseFileList(undefined)).toEqual([]);
    expect(parseFileList(123)).toEqual([]);
  });
});

describe('fileCount', () => {
  it('menghitung jumlah file dari array', () => {
    expect(fileCount(['a.py', 'b.py'])).toBe(2);
  });
  it('menghitung dari string JSON', () => {
    expect(fileCount("['x.py','y.py']")).toBe(2);
  });
  it('kosong → 0', () => {
    expect(fileCount('')).toBe(0);
  });
});
