// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
let apiMock
vi.mock('../lib/api', () => ({ api: (...a) => apiMock(...a) }))
import WfsPanel from '../components/WfsPanel'
describe('dbg', () => {
  it('dbg', async () => {
    const calls = []
    apiMock = vi.fn(async (path, opt = {}) => {
      calls.push([path, opt.method])
      if (path === 'agents') return { agents: [{ id: 'be1', name: 'be1', role: 'B' }] }
      if (path === 'agents/status') return { agents: {} }
      if (path === 'config/be1' && opt.method === 'POST') { console.log('POSTBODY', JSON.stringify(opt.body)); return { ok: false, error: 'rejected' } }
      if (path === 'config/be1') return { base: 'https://x/v1', model: 'm1', prompt: '', key_hint: '' }
      throw new Error('unexpected ' + path)
    })
    const log = vi.spyOn(console, 'error')
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    fireEvent.click(await screen.findByRole('tab', { name: /Model API/ }))
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://x/v1' } })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'm1' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan/ }))
    await new Promise(r => setTimeout(r, 300))
    console.log('CFGMSG?', document.querySelector('[role=status]')?.textContent); console.log('CALLS', JSON.stringify(calls))
    console.log('ERRS', log.mock.calls.map(c => String(c[0])).join('|'))
    console.log('CFGMSG?', document.querySelector('[role=status]')?.textContent); console.log('CALLS', JSON.stringify(apiMock.mock.calls.map(c=>[c[0],c[1]&&c[1].method,c[1]&&c[1].body&&c[1].body.model]))); console.log('MSG2', JSON.stringify(document.body.textContent.slice(-400))); await new Promise(r=>setTimeout(r,400)); console.log('MSG', JSON.stringify(document.body.textContent.slice(-200)))
    expect(true).toBe(true)
  })
})
