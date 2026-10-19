import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react'
import HUD from './components/HUD'
import Header from './components/Header'
import Ticker from './components/Ticker'
import WfsPanel from './components/WfsPanel'
import TeamStats from './components/TeamStats'
import ActionMenu from './components/ActionMenu'
import QuickToolbar from './components/QuickToolbar'
import OverlayHelp from './components/OverlayHelp'
import TaskModal from './components/TaskModal'
import ConfirmModal from './components/ConfirmModal'
import TaskBoard from './components/TaskBoard'
import ProjectPanel from './components/ProjectPanel'
import ActivityLog from './components/ActivityLog'
import { api } from './lib/api'
import { anyModalOpen } from './lib/modal'

const CsWidget = lazy(() => import('./components/CsWidget'))

export default function App() {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const toastTimer = useRef(null)
  const prevStatus = useRef(null)
  const [time, setTime] = useState(660)
  const [status, setStatus] = useState('Memuat…')
  const [statusKind, setStatusKind] = useState('')
  const [cyberpunk, setCyberpunk] = useState(false)
  const [inMeeting, setInMeeting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [confirm, setConfirm] = useState(null)      // 'pause' | 'resume' | null
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [ask, setAsk] = useState(null)               // konfirmasi generik {title,body,ok,onOk}
  const [paused, setPaused] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [toast, setToast] = useState(null)          // {msg, err}
  const [showLog, setShowLog] = useState(false)
  const [muted, setMuted] = useState(false)
  useEffect(() => {
    const s = sceneRef.current
    if (s && s.isAudioMuted) setMuted(s.isAudioMuted())
    else if (typeof localStorage !== 'undefined') setMuted(localStorage.getItem('wfs_audio_muted') === '1')
  }, [])
  const toggleMute = () => {
    const s = sceneRef.current
    if (!s || !s.isAudioMuted) { setMuted(m => !m); return }
    const v = !s.isAudioMuted()
    s.setAudioMuted(v)
    // baca state scene sungguhan (anti-desync, pola sama dgn tombol Neon)
    setMuted(!!s.isAudioMuted())
  }
  const toggleMuteRef = useRef(toggleMute); toggleMuteRef.current = toggleMute
  const actionMenuApi = useRef(null) // diisi ActionMenu: {toggleNames, toggleRotate} utk shortcut K/R
  const amRef = actionMenuApi
  const [logItems, setLogItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wfs_activity') || '[]') } catch { return [] }
  })
  const pushLog = useCallback((e) => {
    setLogItems(prev => {
      const n = [e, ...prev].slice(0, 50)
      try { localStorage.setItem('wfs_activity', JSON.stringify(n)) } catch { /* abaikan */ }
      return n
    })
  }, [])
  const clearLog = () => { setLogItems([]); try { localStorage.removeItem('wfs_activity') } catch { /* abaikan */ } }

  const flash = useCallback((msg, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // ---- status nyata dari gateway ----
  const refreshStatus = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api('tasks/paused'), api('tasks')])
      setPaused(!!p.paused)
      const c = {}
      const prev = prevStatus.current
      const cur = {}
      ;(t.tasks || []).forEach(x => {
        cur[x.id] = x.status
        if (prev && prev[x.id] !== undefined && prev[x.id] !== x.status) {
          const L = { done: 'selesai', failed: 'gagal', running: 'berjalan', review: 'perlu review', pending: 'antri' }
          const d = new Date()
          pushLog({ t: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), id: x.id, status: x.status, label: L[x.status] || x.status, title: String(x.title || '').slice(0, 50) })
          flash(`Task #${x.id} ${L[x.status] || x.status}: ${String(x.title || '').slice(0, 40)}`, x.status === 'failed')
        }
      })
      prevStatus.current = cur
      ;(t.tasks || []).forEach(x => { c[x.status] = (c[x.status] || 0) + 1 })
      setPendingCount((c.pending || 0) + (c.review || 0) + (c.failed || 0))
      setStatus(p.paused ? 'Dijeda' : `${c.running || 0} jalan · ${c.pending || 0} antri`)
      setStatusKind(p.paused || (c.running || 0) > 0 ? 'busy' : '')
    } catch { setStatus('Gateway offline'); setStatusKind('off') }
  }, [flash, pushLog])
  useEffect(() => {
    refreshStatus()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') refreshStatus() }, 15000)
    return () => clearInterval(iv)
  }, [refreshStatus])

  const [sceneReady, setSceneReady] = useState(false)
  const [sceneErr, setSceneErr] = useState(false)
  // ---- scene 3D (lazy) ----
  useEffect(() => {
    if (!canvasRef.current || sceneRef.current) return
    let cancelled = false
    import('./scene/OfficeScene').then(({ createOfficeScene }) => {
      if (cancelled) return
      try {
        sceneRef.current = createOfficeScene(canvasRef.current, {
          onTimeUpdate: (min) => setTime(min),
          onStatusUpdate: () => {},
          onMeetingChange: (m) => setInMeeting(m),
        })
        setSceneReady(true)
        // sinkron state awal dari scene (mute, neon) saat scene (re)created —
        // useEffect sinkron lama bergantung [flash] tidak jalan lagi setelah init async,
        // jadi neon persist di localStorage tidak terpantul di tombol dock Neon.
        if (sceneRef.current.isAudioMuted) setMuted(!!sceneRef.current.isAudioMuted())
        setCyberpunk(!!sceneRef.current.isCyberpunk())
        // dua arah: pilih agent di panel chat → tampilkan cincin emas di scene
        // peta id gateway → nama agent di scene (desk 3D). ceo tidak ada di scene (diabaikan).
        const SCENE_BY_ID = {
          'be1': 'BUDI', 'be2': 'RIZKY', 'fe1': 'DEWI', 'fe2': 'ANDI',
          'mob1': 'YOGA', 'ux1': 'MAYA', 'devops1': 'TONI', 'qa1': 'RINA',
          'ai-cs': 'BANTUIN AI', 'ai-train': 'TRAINER AI', 'integ': 'INTEGRATOR BOT',
          'mkt1': 'LINA', 'cs-h': 'SUPPORT HUMAN', 'pm1': 'SARI',
        }
        window.__wfsSceneSelect = (name) => {
          const s = sceneRef.current
          if (!s || !s.setSelected) return
          const idMap = {}
          ;(window.__wfsAgentIdList || []).forEach(x => { idMap[x.name] = x.id })
          const sceneName = SCENE_BY_ID[idMap[name]] || name
          const idx = (window.__agentData || []).findIndex(ad => ad.agent && ad.agent.name === sceneName)
          if (idx >= 0) s.setSelected(idx)
        }
      } catch (err) {
        console.error('Scene init failed — UI-only mode:', err)
        setSceneErr(true)
        flash('WebGL tidak tersedia — mode UI saja', true)
      }
    }).catch((err) => {
      console.error('Scene chunk load failed:', err)
      setSceneErr(true)
      flash('Gagal memuat scene 3D', true)
    })
    return () => {
      cancelled = true
      if (sceneRef.current) { sceneRef.current.destroy(); sceneRef.current = null }
      delete window.__wfsSceneSelect
    }
  }, [flash])

  const handleTimeChange = useCallback((minutes) => {
    setTime(minutes)
    if (sceneRef.current) sceneRef.current.setTime(minutes)
  }, [])

  const handleCyberpunk = useCallback(() => {
    if (!sceneRef.current) return flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
    sceneRef.current.toggleCyberpunk()
    // baca state scene sungguhan (anti-desync, pola sama dgn ActionMenu)
    setCyberpunk(!!sceneRef.current.isCyberpunk())
  }, [flash])

  // sinkron state awal dari scene saat scene baru dibuat
  useEffect(() => {
    if (sceneRef.current) setCyberpunk(!!sceneRef.current.isCyberpunk())
  }, [flash])

  // ---- flag modal utk scene: Escape saat overlay terbuka TIDAK boleh reset kamera ----
  // Set saat render (bukan useEffect): update discrete-event React di-flush sinkron
  // sebelum listener window scene jalan, jadi flag pasti sudah benar saat Escape dicek.
  window.__wfsModalOpen = !!(showTask || confirm || ask || showHelp || showLog) || anyModalOpen()

  // Snapshot flag di fase CAPTURE (window capture jalan sebelum semua bubble handler):
  // handler Escape overlay menutup modal & React flush sinkron, sehingga saat handler
  // window scene (bubble) jalan flag sudah false lagi — scene wajib baca snapshot ini.
  useEffect(() => {
    const snap = (e) => { if (e.key === 'Escape') window.__escModalAtDispatch = window.__wfsModalOpen || anyModalOpen() }
    window.addEventListener('keydown', snap, true)
    return () => window.removeEventListener('keydown', snap, true)
  }, [])

  // ---- fokus trap: saat modal/panel App terbuka, chrome lain (HUD, Header, Ticker,
  // dock) dibuat inert — Tab tidak bisa "kabur" ke tombol di balik scrim, dan
  // screen reader tidak membacakan UI yang tertutup. (modal-scrim sudah memblokir
  // klik; inert menutup celah navigasi keyboard.) Panel dgn state internal
  // (TaskBoard/WfsPanel/…) memakai mekanisme sama via useModalFlag di masing-masing.
  const chromeModal = !!(showTask || confirm || ask || showHelp || showLog)
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('header, .hud, .ticker, .dock'))
    els.forEach(el => { if (chromeModal) el.setAttribute('inert', ''); else el.removeAttribute('inert') })
    return () => els.forEach(el => el.removeAttribute('inert'))
  }, [chromeModal])

  // ---- shortcut keyboard (abaikan saat fokus di input/textarea/modal) ----
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (showTask || confirm || ask || showHelp || showLog) return
      const k = e.key.toLowerCase()
      if (k === 'm') { e.preventDefault(); toggleMuteRef.current() }
      else if (k === 'l') { e.preventDefault(); setShowLog(v => !v) }
      else if (k === 'h' || k === '?') { e.preventDefault(); setShowHelp(v => !v) }
      else if (k === 'n') { e.preventDefault(); handleCyberpunk() }
      else if (k === '1' || k === '2' || k === '3') {
        e.preventDefault()
        const s = sceneRef.current
        if (s && s.setView) s.setView(k === '1' ? 'iso' : k === '2' ? 'front' : 'top')
      }
      else if (k === '0') {
        e.preventDefault()
        const s = sceneRef.current
        if (s && s.setView) { s.setView('iso'); if (s.resetFocus) s.resetFocus() }
      }
      else if (k === 'k') { e.preventDefault(); amRef.current?.toggleNames() }
      else if (k === 'r') { e.preventDefault(); amRef.current?.toggleRotate() }
      else if (k === 'f') {
        e.preventDefault()
        const d = document
        if (d.fullscreenElement) { d.exitFullscreen?.() } else { d.documentElement.requestFullscreen?.().catch(() => flash('Fullscreen ditolak browser', true)) }
      }
      else if (k === '+' || k === '=') zoom(1)
      else if (k === '-') zoom(-1)
      else if (k === 'escape') { setShowLog(false); setShowHelp(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTask, confirm, ask, showHelp, showLog, handleCyberpunk])

  const zoom = (dir) => {
    const s = sceneRef.current
    if (!s) return flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
    dir > 0 ? s.zoomIn() : s.zoomOut()
  }

  // ---- Pause / Resume nyata (konfirmasi dulu) ----
  const doConfirm = async () => {
    setConfirmBusy(true)
    try {
      if (confirm === 'pause') {
        const d = await api('tasks/pause_all', { method: 'POST', body: {} })
        flash(`Dijeda — ${d.cancelled} proses dihentikan, ${d.reset} task kembali pending`)
      } else {
        const d = await api('tasks/resume_all', { method: 'POST', body: {} })
        flash(`Dilanjutkan — ${d.started.length} task dijalankan`)
      }
      setConfirm(null); refreshStatus()
    } catch (e) { flash(e.message, true); setConfirm(null) }
    setConfirmBusy(false)
  }

  const formatTime = (min) => {
    const h = Math.floor(min / 60), m = Math.floor(min % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return (
    <>
      <div ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} aria-hidden="true" />
      {!sceneReady && !sceneErr && <div className="scene-loading" role="status">Memuat ruangan…</div>}
      {sceneErr && <div className="scene-loading err" role="alert">Scene 3D tidak aktif — mode UI saja. Muat ulang halaman untuk mencoba lagi.</div>}
      <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,6,16,0.5) 100%)' }} />

      <Header />
      <Ticker />

      {inMeeting && <div className="meeting-badge" role="status"><div><i />Rapat berlangsung</div></div>}

      <HUD time={formatTime(time)} timeValue={time} status={status} statusKind={statusKind}
        onTimeChange={handleTimeChange} />

      {/* Dock bawah: satu bilah, tidak ada elemen saling tumpuk. */}
      <div className="dock" role="toolbar" aria-label="Menu utama">
        <QuickToolbar
          paused={paused}
          onAddTask={() => setShowTask(true)}
          onPauseAll={() => setConfirm('pause')}
          onResumeAll={() => setConfirm('resume')}
          onToggleTheme={handleCyberpunk}
          theme={!cyberpunk}
          onZoomIn={() => zoom(1)}
          onZoomOut={() => zoom(-1)}
          onSetView={(v) => {
            const s = sceneRef.current
            if (!s || !s.setView) return flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
            s.setView(v)
          }} />
        <span className="sep" />
        <ActionMenu sceneRef={sceneRef} onFlash={flash} refApi={actionMenuApi} />
        <TaskBoard onFlash={flash} onAsk={setAsk} />
        <ProjectPanel onFlash={flash} />
        <TeamStats />
        <button className="ibtn" onClick={toggleMute} title={muted ? 'Nyalakan suara notifikasi' : 'Bisukan suara notifikasi'} aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'}><span className="ic">{muted ? '🔇' : '🔊'}</span><span className="lb">{muted ? 'Suara Mati' : 'Suara'}</span></button>
        <button className="ibtn" onClick={() => setShowLog(true)} title="Log aktivitas kantor" aria-label="Log aktivitas"><span className="ic">📜</span><span className="lb">Log</span></button>
        <span className="sep" />
        <WfsPanel />
        <Suspense fallback={null}><CsWidget /></Suspense>
        <button className="ibtn" onClick={() => setShowHelp(true)} title="Panduan penggunaan kantor" aria-label="Bantuan"><span className="ic">❔</span><span className="lb">Bantuan</span></button>
      </div>

      <ActivityLog show={showLog} items={logItems} onClose={() => setShowLog(false)} onClear={clearLog} />
      <OverlayHelp show={showHelp} onClose={() => setShowHelp(false)} />
      <TaskModal show={showTask} onClose={() => setShowTask(false)} onDone={(m) => { flash(m); refreshStatus() }} />
      <ConfirmModal
        show={!!confirm} busy={confirmBusy}
        danger={confirm === 'pause'}
        title={confirm === 'pause' ? 'Jeda semua task?' : 'Lanjutkan semua task?'}
        text={confirm === 'pause'
          ? 'Semua task yang sedang berjalan dihentikan dan dikembalikan ke status pending. Task baru tidak akan jalan sampai Anda menekan Lanjut.'
          : `${pendingCount} task (pending/review/failed) akan dijalankan. Tiap task memanggil model AI dan memakai kuota API. Lanjutkan?`}
        confirmLabel={confirm === 'pause' ? 'Ya, jeda' : 'Ya, jalankan'}
        onConfirm={doConfirm} onCancel={() => setConfirm(null)} />

      <ConfirmModal show={!!ask} title={ask?.title} text={ask?.body} confirmLabel={ask?.ok}
        onConfirm={() => { const f = ask.onOk; setAsk(null); f() }} onCancel={() => setAsk(null)} />

      {toast && <div className={'toast' + (toast.err ? ' err' : '')} role="status" aria-live="polite">{toast.msg}</div>}
    </>
  )
}
