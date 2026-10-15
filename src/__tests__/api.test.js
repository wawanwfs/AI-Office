// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, uiToken } from '../lib/api'

beforeEach(() => { document.head.innerHTML = '<meta name="wfs-ui-token" content="tok">'; vi.restoreAllMocks() })
const mock = (status, data) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => data })))

describe('api', () => {
  it('membaca token dari meta', () => expect(uiToken()).toBe('tok'))
  it('GET tanpa token', async () => {
    mock(200, { a: 1 })
    expect(await api('/tasks')).toEqual({ a: 1 })
    const [url, o] = fetch.mock.calls[0]
    expect(url).toBe('/wfs-api/tasks'); expect(o.headers['X-WFS-Token']).toBeUndefined()
  })
  it('POST membawa token & body', async () => {
    mock(200, {})
    await api('x', { method: 'POST', body: { b: 2 } })
    const o = fetch.mock.calls[0][1]
    expect(o.headers['X-WFS-Token']).toBe('tok'); expect(o.body).toBe('{"b":2}')
  })
  it('401 -> pesan sesi', async () => {
    mock(401, null)
    await expect(api('x')).rejects.toMatchObject({ status: 401, message: /Sesi tidak valid/ })
  })
  it('error detail dari server', async () => {
    mock(500, { detail: 'boom' })
    await expect(api('x')).rejects.toThrow('boom')
  })
  it('fallback HTTP status & path tanpa slash awal', async () => {
    mock(503, null)
    await expect(api('/tasks')).rejects.toThrow('HTTP 503')
    expect(fetch.mock.calls[0][0]).toBe('/wfs-api/tasks')
  })
  it('detail objek di-stringify', async () => {
    mock(422, { detail: { f: 1 } })
    await expect(api('x')).rejects.toThrow('{"f":1}')
  })
})
