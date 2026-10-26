import React, { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useModalFlag } from '../lib/modal'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconChat, IconClose, IconGear, IconSave, IconPlay, IconRotate } from './Icons'

// Navigasi panah tablist (pola WAI-ARIA tabs): Left/Right/Home/End memindahkan
// fokus antar tab; Tab keluar seperti biasa (roving tabindex di render).
const tabKeys = (e, setTab) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  const tabs = ['chat', 'config']
  const i = tabs.indexOf(document.activeElement?.id === 'wfs-tab-config' ? 'config' : 'chat')
  let n
  if (e.key === 'Home') n = 0
  else if (e.key === 'End') n = tabs.length - 1
  else n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length
  e.preventDefault(); setTab(tabs[n])
  // fokus ulang tab tujuan setelah re-render (roving tabindex berganti)
  setTimeout(() => { const el = document.getElementById('wfs-tab-' + tabs[n]); if (el) el.focus() }, 60)
}

// Panel chat AI + konfigurasi per agent — gateway :8787 via /wfs-api
export default function WfsPanel() {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useModalFlag(open)
  const [tab, setTab] = useState('chat')
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [sel, setSel] = useState(null)
  const [logs, setLogs] = useState({})          // riwayat per agent
  const [input, setInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [cfgBusy, setCfgBusy] = useState(false)
  const [cfg, setCfg] = useState({ base_url: '', api_key: '', model: '', instructions: '', key_hint: '' })
  const [cfgMsg, setCfgMsg] = useState('')
  const [stat, setStat] = useState({})
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const agentsRef = useRef([])
  const onCloseRef = useRef(() => setOpen(false))
  // setOpen dari useState stabil, jadi useCallback([]) memberi identitas permanen.
  // Kalau inline closure: effect useDialogA11y re-run tiap render (setTab dsb) —
  // cleanup-nya memindahkan fokus ke tombol pertama (✕) & merusak navigasi tablist.
  const closePanel = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closePanel, ref: box, initialFocus: inputRef })

  const log = sel ? (logs[sel.id] || []) : []
  const pushLog = (id, m) => setLogs(l => ({ ...l, [id]: [...(l[id] || []), m] }))

  const loadCfg = useCallback(async (a) => {
    setCfgMsg('')
    try {
      const d = await api('config/' + a.id)
      setCfg({ base_url: d.base || '', api_key: '', model: d.model || '', instructions: d.prompt || '', key_hint: d.key_hint || '' })
    } catch { setCfg({ base_url: '', api_key: '', model: '', instructions: '', key_hint: '' }); setCfgMsg('⚠ Gagal memuat konfigurasi') }
  }, [])

  const choose = useCallback((a) => { setSel(a); loadCfg(a); window.__wfsSceneSelect && window.__wfsSceneSelect(a.name) }, [loadCfg])

  const loadAgents = useCallback(() => {
    setLoading(true); setLoadErr('')
    api('agents').then(d => {
      const list = Array.isArray(d) ? d : (d.agents || [])
      setAgents(list); agentsRef.current = list
      if (list.length) setSel(s => s || list[0])
      window.__wfsAgentIdList = list.map(a => ({ name: a.name, id: a.id }))
      window.__wfsSelectAgent = (id) => {
        const a = agentsRef.current.find(x =>
          x.id === id ||
          x.name === id ||
          (x.name && id && x.name.toLowerCase() === String(id).toLowerCase()) ||
          (x.id && id && x.id.toLowerCase() === String(id).toLowerCase())
        )
        if (a) {
          setOpen(true); setTab('chat'); choose(a)
        } else {
          setOpen(true); setTab('chat')
        }
      }
    }).catch(e => setLoadErr('Gagal memuat daftar agent: ' + e.message)).finally(() => setLoading(false))
  }, [choose])

  useEffect(() => { const t0 = setTimeout(loadAgents, 0); return () => clearTimeout(t0) }, [loadAgents])
  useEffect(() => {
    if (!open) return
    let dead = false
    const ld = () => api('agents/status').then(d => { if (!dead) setStat(d.agents || {}) }).catch(() => {})
    const t0 = setTimeout(ld, 0); const iv = setInterval(() => { if (document.visibilityState === 'visible') ld() }, 15000)
    return () => { dead = true; clearTimeout(t0); clearInterval(iv) }
  }, [open])
  useEffect(() => { if (sel) loadCfg(sel) }, [sel, loadCfg])   // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [logs, chatBusy])
  useEffect(() => {
    if (!open) return
    const k = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open, tab])

  const send = async () => {
    const q = input.trim()
    if (!q || !sel || chatBusy) return
    const id = sel.id
    const history = (logs[id] || []).filter(m => m.who !== 'err').map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }))
    setInput(''); setChatBusy(true); pushLog(id, { who: 'me', text: q })
    try {
      const d = await api('chat', { method: 'POST', body: { agent_id: id, message: q, history } })
      if (d && d.ok === false) pushLog(id, { who: 'err', text: '⚠ ' + (d.error || 'Gagal'), retry: q })
      else pushLog(id, { who: 'ai', text: (d && d.reply) || '(kosong)' })
    } catch (e) { pushLog(id, { who: 'err', text: '⚠ ' + e.message, retry: q }) }
    setChatBusy(false)
  }

  const saveCfg = async (reset = false) => {
    setCfgBusy(true); setCfgMsg('')
    try {
      const body = reset ? { base: '-', key: '-', model: '-', prompt: '-' }
        : { base: cfg.base_url, key: cfg.api_key, model: cfg.model, prompt: cfg.instructions }
      const d = await api('config/' + sel.id, { method: 'POST', body })
      await loadCfg(sel)   // muat ulang cfg dulu (loadCfg mengosongkan pesan), baru tampilkan hasil simpan — tanpa ini pesan sukses/gagal langsung terhapus dan tak pernah terlihat
      setCfgMsg(d.ok ? (reset ? '✅ Direset ke default' : '✅ Tersimpan') : '⚠ ' + (d.error || 'gagal'))
    } catch (e) { setCfgMsg('⚠ ' + e.message) }
    setCfgBusy(false)
  }

  const testCfg = async () => {
    setCfgBusy(true); setCfgMsg('⏳ Menguji…')
    try {
      const d = await api('test', { method: 'POST', body: { base: cfg.base_url, key: cfg.api_key, model: cfg.model } })
      setCfgMsg(d.ok ? '✅ OK — ' + (d.models != null ? d.models + ' model tersedia' : 'tersambung') : '⚠ ' + (d.error || 'gagal'))
    } catch (e) { setCfgMsg('⚠ ' + e.message) }
    setCfgBusy(false)
  }

  return (
    <>
      <button className="ibtn" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="wfs-panel" aria-label="Chat AI Team" title="Chat langsung dengan AI Team">
        <span className="ic"><IconChat size={19} /><span className="sr-only">💬</span></span><span className="lb">Chat</span>
      </button>
      {open && (
        <div ref={box} id="wfs-panel" className="panel" role="dialog" aria-label="Chat dan konfigurasi agent" aria-modal="true">
          <div className="ph">
            <div className="t">{sel ? sel.name : 'Chat AI Team'}<small>{sel ? sel.role : ''} · {tab === 'chat' ? 'percakapan' : 'konfigurasi model'}</small></div>
            <button className="x" onClick={() => setOpen(false)} aria-label="Tutup panel chat" title="Tutup panel chat (Esc)">
              <IconClose size={18} />
              <span className="sr-only">✕</span>
            </button>
          </div>
          <div className="tabs" role="tablist" aria-label="Panel chat / konfigurasi" onKeyDown={e => tabKeys(e, setTab)}>
            <button role="tab" id="wfs-tab-chat" tabIndex={tab === 'chat' ? 0 : -1} aria-selected={tab === 'chat'} aria-controls="wfs-tabpanel-chat" onClick={() => setTab('chat')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <IconChat size={15} />
              <span>Chat</span>
            </button>
            <button role="tab" id="wfs-tab-config" tabIndex={tab === 'config' ? 0 : -1} aria-selected={tab === 'config'} aria-controls="wfs-tabpanel-config" onClick={() => setTab('config')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <IconGear size={15} />
              <span>Model API</span>
            </button>
          </div>
          <div style={{ padding: '8px 12px 0' }}>
            {loading && <div className="skeleton" role="status">Memuat agent…</div>}
            {loadErr && <div role="alert" className="msg err" style={{ maxWidth: '100%', marginBottom: 8 }}>{loadErr} <button className="btn" style={{ minHeight: 32, marginLeft: 6 }} onClick={loadAgents}>Muat ulang</button></div>}
            {agents.length > 0 && (
              <select className="sel" aria-label="Pilih agent" value={sel ? sel.id : ''} onChange={e => choose(agents.find(a => a.id === e.target.value))}>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
              </select>
            )}
          </div>
          {sel && (() => { const st = stat[sel.id] || {}; const it = [['done','Selesai','#10E5A0'],['running','Jalan','#f59e0b'],['pending','Antri','#9aa3b5'],['review','Review','#60A5FA'],['failed','Gagal','#f66']]; return (
            <div aria-label="Info agent" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '8px 14px 0', fontSize: 12.5 }}>
              {it.map(([k, l, c]) => <span key={k}><b style={{ color: c }}>{st[k] || 0}</b> {l}</span>)}
            </div>) })()}
          {tab === 'chat' ? (
            <>
              <div id="wfs-tabpanel-chat" role="tabpanel" aria-labelledby="wfs-tab-chat" style={{ display: 'contents' }}>
              <div ref={logRef} role="log" aria-live="polite" style={{ flex: 1, overflowY: 'auto', padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 160 }}>
                {log.length === 0 && <div className="note" style={{ textAlign: 'center', margin: 'auto' }}>Tanya apa saja ke {sel ? sel.name : 'agent'}…</div>}
                {log.map((m, i) => (
                  <div key={i} className={'msg ' + (m.who === 'me' ? 'me' : m.who === 'err' ? 'err' : '')} role={m.who === 'err' ? 'alert' : undefined}>
                    {m.text}
                    {m.retry && i === log.length - 1 && <div><button className="btn" style={{ minHeight: 32, marginTop: 6 }} onClick={() => { setInput(m.retry); inputRef.current && inputRef.current.focus() }}>Kirim ulang</button></div>}
                  </div>
                ))}
                {chatBusy && <div className="note" style={{ color: 'var(--amber)' }}>⏳ {sel ? sel.name : 'Agent'} mengetik…</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border)' }}>
                <input ref={inputRef} className="fld" style={{ marginBottom: 0 }} value={input} aria-label="Pesan" placeholder="Ketik pesan… (Enter kirim)"
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }} />
                <button className="btn primary" onClick={send} disabled={chatBusy || !input.trim() || !sel}>Kirim</button>
              </div>
              </div>
            </>
          ) : (
            <div id="wfs-tabpanel-config" role="tabpanel" aria-labelledby="wfs-tab-config" style={{ padding: '4px 12px 12px', overflowY: 'auto' }}>
              <div className="note" style={{ marginBottom: 8 }}>Kosongkan semua = pakai AI default WFS. Isi untuk model berbeda per agent.</div>
              <input className="fld" aria-label="Base URL" placeholder="Base URL (https://…/v1)" value={cfg.base_url} onChange={e => setCfg({ ...cfg, base_url: e.target.value })} />
              <input className="fld" aria-label="API Key" type="password" autoComplete="off" value={cfg.api_key} onChange={e => setCfg({ ...cfg, api_key: e.target.value })}
                placeholder={cfg.key_hint ? `API Key (tersimpan: ${cfg.key_hint} — kosong = tetap)` : 'API Key (kosong = tidak diubah)'} />
              <input className="fld" aria-label="Model" placeholder="Model (mis. gpt-4o-mini)" value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value })} />
              <textarea className="fld" aria-label="Instruksi khusus agent" style={{ height: 70, resize: 'vertical' }} placeholder="Instruksi khusus agent" value={cfg.instructions} onChange={e => setCfg({ ...cfg, instructions: e.target.value })} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn primary" onClick={() => saveCfg(false)} disabled={cfgBusy || !sel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconSave size={15} />
                  <span>Simpan</span>
                </button>
                <button className="btn" onClick={testCfg} disabled={cfgBusy || !sel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconPlay size={14} />
                  <span>Test</span>
                </button>
                <button className="btn" onClick={() => saveCfg(true)} disabled={cfgBusy || !sel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IconRotate size={14} />
                  <span>Reset default</span>
                </button>
              </div>
              {cfgMsg && <div role="status" className="note" style={{ color: 'var(--amber)', marginTop: 8 }}>{cfgMsg}</div>}
            </div>
          )}
        </div>
      )}
    </>
  )
}
