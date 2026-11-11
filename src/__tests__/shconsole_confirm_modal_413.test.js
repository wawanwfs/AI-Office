// Siklus 413: dialog konfirmasi bawaan browser di ShConsole diganti ConfirmModal aksesibel
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(__dirname, '../components/ShConsole.jsx'), 'utf8')

describe('siklus 413 — konfirmasi bulk-run via ConfirmModal', () => {
  it('tidak memakai dialog konfirmasi bawaan browser lagi', () => {
    expect(src).not.toMatch(/window\.confirm/)
  })

  it('menampilkan ConfirmModal dengan judul & teks scope', () => {
    expect(src).toMatch(/import ConfirmModal from '\.\/ConfirmModal'/)
    expect(src).toMatch(/title=\{?"Jalankan semua task\?"/)
    expect(src).toMatch(/Jalankan semua task di \$\{bulkConfirm\}/)
  })

  it('konfirmasi memanggil runAllPending dengan scope terkonfirmasi', () => {
    expect(src).toMatch(/runAllPending\(scope\)/)
  })
})
