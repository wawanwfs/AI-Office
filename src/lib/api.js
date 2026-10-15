// Helper API gateway (via proxy /wfs-api) — POST otomatis membawa token UI.
export const uiToken = () =>
  (typeof document !== 'undefined' && document.querySelector('meta[name="wfs-ui-token"]')?.content) || ''

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (method !== 'GET') headers['X-WFS-Token'] = uiToken()
  const r = await fetch('/wfs-api/' + path.replace(/^\//, ''), {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
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
