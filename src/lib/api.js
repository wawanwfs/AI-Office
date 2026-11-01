// Helper API gateway (via proxy /wfs-api) — POST otomatis membawa token UI.
export const uiToken = () =>
  (typeof document !== 'undefined' && document.querySelector('meta[name="wfs-ui-token"]')?.content) || ''

import { FETCH_TIMEOUT, fetchWithTimeout } from './fetch_timeout.js'

export async function api(path, { method = 'GET', body, signal, timeoutMs } = {}) {
  // Deadline default siklus 203 (fetch tanpa signal TIDAK punya timeout di
  // browser): endpoint komputasi (sh/exec, git) 60 dtk, tulis 30 dtk —
  // `signal` pemanggil tetap menang (abort panel/komponen didukung penuh).
  const t = timeoutMs ?? (method === 'GET'
    ? (/^(sh\/exec|projects\/[^/]+\/(git|exec))/.test(path) ? FETCH_TIMEOUT.POLL_LONG : FETCH_TIMEOUT.GET)
    : FETCH_TIMEOUT.POST)
  const headers = { 'Content-Type': 'application/json' }
  if (method !== 'GET') headers['X-WFS-Token'] = uiToken()
  const r = await fetchWithTimeout('/wfs-api/' + path.replace(/^\//, ''), {
    method, headers, timeoutMs: t, signal, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* non-JSON */ }
  if (!r.ok) {
    const msg = r.status === 401 ? 'Sesi tidak valid — muat ulang halaman'
      : (data && (data.detail || data.error)) || ('HTTP ' + r.status)
    const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    e.status = r.status
    throw e
  }
  return data
}
