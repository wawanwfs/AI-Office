import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './preview.css'

function PreviewProof() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [protectedData, setProtectedData] = useState(null)
  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/health',{signal:ctrl.signal,cache:'no-store'})
      .then(r=>r.ok?r.json():Promise.reject(new Error('Backend unavailable')))
      .then(setStatus).catch(e=>{if(e.name!=='AbortError')setError(e.message)})
    return () => ctrl.abort()
  }, [])
  async function inspect() {
    setError('')
    try {
      const res=await fetch('/api/db',{credentials:'omit',cache:'no-store',
        headers:{Authorization:'Bearer '+token}})
      if(!res.ok) throw new Error('Authenticated database query rejected: HTTP '+res.status)
      setProtectedData(await res.json())
    } catch(e) { setError(e.message) }
  }
  return <main className="preview-shell">
    <section className="hero">
      <span className="eyebrow">WFS PROJECT / PHASE 5</span>
      <div className="brand-icon" aria-hidden="true">W</div>
      <h1>Real Full-Stack<br/><em>Preview Proof</em></h1>
      <p>React/Vite frontend, FastAPI backend, PostgreSQL database.
        This is an isolated disposable development runtime, not a production deployment.</p>
      <div className="cards">
        <article><span>FRONTEND</span><strong>React + Vite</strong><small>Rendered from a real Vite production build</small></article>
        <article><span>BACKEND</span><strong>FastAPI</strong><small>Actual Docker service, healthy API</small></article>
        <article><span>DATABASE</span><strong>PostgreSQL</strong><small>{status?.ok ? 'Live SELECT 1 succeeded' : 'Awaiting live healthcheck'}</small></article>
      </div>
      <div className="status" role="status">
        <b>{status?.ok?'● All three services connected':error?'● Runtime unavailable':'● Checking real services…'}</b>
        {status?.ok && <span>Verified PostgreSQL connection · no fake metrics</span>}
      </div>
    </section>
    <section className="protected">
      <h2>Authenticated runtime inspection</h2>
      <p>Test operator bearer required. Token stays in memory only.</p>
      <div><input type="password" aria-label="Ephemeral test token" value={token}
        onChange={e=>setToken(e.target.value)} autoComplete="off" placeholder="Disposable test token"/>
        <button onClick={inspect}>Query protected database</button></div>
      {protectedData && <p role="status">PostgreSQL SELECT result: {protectedData.postgres_query}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </main>
}
createRoot(document.getElementById('root')).render(<PreviewProof/>)
