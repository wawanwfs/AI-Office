import { describe, it, expect } from 'vitest'
import { statusPollActions } from '../scene/parts/status_poll'

const mkAd = (name, state = 'sitting') => ({ agent: { name }, state, sittingChar: { userData: { badge: {} } }, walker: { visible: false }, home: { x: 1, z: 2 } })

describe('statusPollActions (gabungan badge/wake/alert)', () => {
  const im = { Budi: 'be1', Toni: 'fe1' }
  const findByGid = (gid) => (gid === 'be1' ? mkAd('Budi') : null)

  it('badge: entri dengan warna dari palet', () => {
    const prev = {}
    const acts = statusPollActions([mkAd('Budi')], { be1: { last: 'done', running: 0 } }, im, prev, findByGid)
    const b = acts.find(a => a.type === 'badge')
    expect(b).toMatchObject({ type: 'badge', status: 'done', color: '#10E5A0' })
  })

  it('wake: running>0 → aksi wake dengan ad valid', () => {
    const acts = statusPollActions([mkAd('Budi')], { be1: { running: 2 } }, im, {}, findByGid)
    const w = acts.find(a => a.type === 'wake')
    expect(w).toMatchObject({ type: 'wake', gid: 'be1' })
    expect(w.ad.state).toBe('sitting')
  })

  it('wake: agent tak ditemukan → tanpa aksi wake', () => {
    const acts = statusPollActions([mkAd('Budi')], { zz: { running: 2 } }, im, {}, findByGid)
    expect(acts.some(a => a.type === 'wake')).toBe(false)
  })

  it('alert: transisi failed → satu aksi alert', () => {
    const acts = statusPollActions([mkAd('Budi')], { be1: { failed: 1 } }, im, {}, findByGid)
    expect(acts.filter(a => a.type === 'alert')).toHaveLength(1)
  })

  it('alert: nilai failed sama → tanpa aksi alert (prevFailed dimutasi)', () => {
    const prev = { be1: 1 }
    const acts = statusPollActions([mkAd('Budi')], { be1: { failed: 1 } }, im, prev, findByGid)
    expect(acts.some(a => a.type === 'alert')).toBe(false)
  })

  it('urutan aksi: badge sebelum wake sebelum alert', () => {
    const acts = statusPollActions([mkAd('Budi')], { be1: { last: 'done', running: 1, failed: 1 } }, im, {}, findByGid)
    expect(acts.map(a => a.type)).toEqual(['badge', 'wake', 'alert'])
  })

  it('agents kosong → tanpa aksi', () => {
    expect(statusPollActions([mkAd('Budi')], {}, im, {}, findByGid)).toEqual([])
  })

  it('agentData kosong → hanya aksi tanpa ad (badge/tanpa ad di-skip)', () => {
    const acts = statusPollActions([], { be1: { last: 'done' } }, im, {}, findByGid)
    expect(acts).toEqual([])
  })

  it('prevFailed reset ke 0 saat failed=0 (tanpa aksi)', () => {
    const prev = { be1: 3 }
    statusPollActions([mkAd('Budi')], { be1: { failed: 0 } }, im, prev, findByGid)
    expect(prev.be1).toBe(0)
  })

  it('badge dengan status tanpa warna di palet → di-skip', () => {
    const acts = statusPollActions([mkAd('Budi')], { be1: { last: 'weird' } }, im, {}, findByGid)
    expect(acts).toEqual([])
  })
})
