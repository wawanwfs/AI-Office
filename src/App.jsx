import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react'
import { clip } from './lib/clip.js'
import HUD from './components/HUD'
import Header from './components/Header'
import SkipLink from './components/SkipLink'
import Ticker from './components/Ticker'
import SysMeter from './components/SysMeter'
import WfsPanel from './components/WfsPanel'
import TeamStats from './components/TeamStats'
import Dashboard from './components/Dashboard'
import ActionMenu from './components/ActionMenu'
import QuickToolbar from './components/QuickToolbar'
import OverlayHelp from './components/OverlayHelp'
import TaskModal from './components/TaskModal'
import ConfirmModal from './components/ConfirmModal'
import TaskBoard from './components/TaskBoard'
import ProjectPanel from './components/ProjectPanel'
import ActivityLog from './components/ActivityLog'
import AgentInspector from './components/AgentInspector'
import ShConsole from './components/ShConsole'
import FloorNavigator from './components/FloorNavigator'
import SettingsModal from './components/SettingsModal'
import { IconVolume, IconVolumeMute, IconScroll, IconHelp, IconGear } from './components/Icons'
import { api } from './lib/api'
import { anyModalOpen, wfsRefreshModalFlag, wfsSetAppModalBase } from './lib/modal'
import { createWakeLockManager } from './lib/wakelock.js'
import { applyPollResult, nextPollDelay, connectionBadge, STALE_AFTER_MS } from './lib/connection_spec.js'
import {
  loadAmbienceEnabled,
  saveAmbienceEnabled,
  loadAmbienceVolume,
  saveAmbienceVolume,
  DEFAULT_AMBIENCE_VOLUME,
  getNextAmbiencePreset,
  formatAmbiencePercent,
} from './scene/parts/sound_spec.js'
import { resolveShortcutAction } from './scene/parts/shortcut_spec.js'
import { findAgentLiveEntry, agentLiveLevel } from './scene/parts/agent_status.js'
import { perfChip } from './scene/parts/perf_quality.js'
import { triggerSnapshotDownload } from './scene/parts/snapshot_spec.js'

const CsWidget = lazy(() => import('./components/CsWidget'))

export default function App() {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const toastTimer = useRef(null)
  const prevStatus = useRef(null)
  const [time, setTime] = useState(() => { // mulai dari jam nyata (sinkron dgn scene)
    const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })
  const [status, setStatus] = useState('Memuat…')
  const [statusKind, setStatusKind] = useState('')
  // Fase kantor live dari scene (daycycle.statusAt via onStatusUpdate) —
  // dulu callback ini kosong () => {} sehingga 12 label fase (fokus, rapat,
  // makan siang, shift malam…) tidak pernah tampil di UI.
  const [officePhase, setOfficePhase] = useState(null)
  // Siklus 159 — deep-link dari landing: #dashboard membuka Dashboard on-mount.
  // Landing CTA "Lihat Dashboard" menautkan ke /app/#dashboard — tanpa ini
  // hash hanya dilihat oleh server (404) atau terbuang. Jalur runtime tunggal:
  // event 'wfs-toggle-dashboard' yang SAMA dgn shortcut D (tak ada duplikat state).
  useEffect(() => {
    if (window.location.hash !== '#dashboard') return
    window.dispatchEvent(new CustomEvent('wfs-toggle-dashboard'))
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  // Fallback landing → app: hash bisa hilang oleh redirect/pengetikan manual.
  useEffect(() => {
    try {
      if (localStorage.getItem('wfs_open_dashboard') !== '1') return
      localStorage.removeItem('wfs_open_dashboard')
      window.dispatchEvent(new CustomEvent('wfs-toggle-dashboard'))
    } catch { /* storage privat/terblokir — abaikan */ }
  }, [])
  const [conn, setConn] = useState(() => applyPollResult(null, { ok: false, error: 'init' }, 0))
  const [cyberpunk, setCyberpunk] = useState(() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('wfs_neon') === '1' } catch { return false }
  })
  const [inMeeting, setInMeeting] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [confirm, setConfirm] = useState(null)      // 'pause' | 'resume' | null
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [ask, setAsk] = useState(null)               // konfirmasi generik {title,body,ok,onOk}
  const [paused, setPaused] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [toast, setToast] = useState(null)          // {msg, err}
  const connRef = useRef(conn); connRef.current = conn
  const [showLog, setShowLog] = useState(false)
  const [muted, setMuted] = useState(() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('wfs_audio_muted') === '1' } catch { return false }
  })
  const [ambienceEnabled, setAmbienceEnabled] = useState(() => {
    try { return loadAmbienceEnabled(typeof localStorage !== 'undefined' ? localStorage : null) } catch { return false }
  })
  const [ambienceVolume, setAmbienceVolume] = useState(() => {
    try { return loadAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null) } catch { return DEFAULT_AMBIENCE_VOLUME }
  })
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [currentFloor, setCurrentFloor] = useState(1)
  const handleCloseInspector = useCallback(() => {
    setSelectedAgent(null)
    const s = sceneRef.current
    if (s) {
      if (s.setSelected) s.setSelected(-1)
      if (s.resetFocus) s.resetFocus()
    }
  }, [])
  const toggleMute = () => {
    const s = sceneRef.current
    if (!s || !s.isAudioMuted) { setMuted(m => !m); return }
    const v = !s.isAudioMuted()
    s.setAudioMuted(v)
    // baca state scene sungguhan (anti-desync, pola sama dgn tombol Neon)
    const newMuted = !!s.isAudioMuted()
    setMuted(newMuted)
    if (!newMuted && s.playSelect) s.playSelect()
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

  useEffect(() => {
    const onAmbienceChange = (e) => {
      if (e && e.detail) {
        if (typeof e.detail.enabled === 'boolean') setAmbienceEnabled(e.detail.enabled)
        if (typeof e.detail.volume === 'number') setAmbienceVolume(e.detail.volume)
        if (typeof e.detail.muted === 'boolean') setMuted(e.detail.muted)
      }
    }
    window.addEventListener('wfs-ambience-changed', onAmbienceChange)
    return () => window.removeEventListener('wfs-ambience-changed', onAmbienceChange)
  }, [])

  const toggleAmbience = useCallback((e) => {
    if (e && e.shiftKey) {
      const nextVol = getNextAmbiencePreset(ambienceVolume)
      setAmbienceVolume(nextVol)
      const s = sceneRef.current
      if (s && s.setAmbienceVolume) {
        s.setAmbienceVolume(nextVol)
        if (!muted && s.playSelect) s.playSelect()
      } else {
        try { saveAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null, nextVol) } catch { /* noop */ }
      }
      flash(`Volume ambience kantor: ${formatAmbiencePercent(nextVol)}`)
      return
    }

    const s = sceneRef.current
    if (muted && s && s.setAudioMuted) {
      s.setAudioMuted(false)
      setMuted(false)
    }
    const next = !ambienceEnabled
    setAmbienceEnabled(next)
    if (s && s.setAmbienceEnabled) {
      s.setAmbienceEnabled(next)
      if (next && s.playSelect) s.playSelect()
    } else {
      try { saveAmbienceEnabled(typeof localStorage !== 'undefined' ? localStorage : null, next) } catch { /* noop */ }
    }
    flash(next ? `Ambience kantor aktif (${formatAmbiencePercent(ambienceVolume)})` : 'Ambience kantor dinonaktifkan')
  }, [ambienceEnabled, ambienceVolume, muted, flash])

  const cycleAmbienceVolume = useCallback(() => {
    const nextVol = getNextAmbiencePreset(ambienceVolume)
    setAmbienceVolume(nextVol)
    const s = sceneRef.current
    if (s && s.setAmbienceVolume) {
      s.setAmbienceVolume(nextVol)
      if (!muted && s.playSelect) s.playSelect()
    } else {
      try { saveAmbienceVolume(typeof localStorage !== 'undefined' ? localStorage : null, nextVol) } catch { /* noop */ }
    }
    flash(`Volume ambience kantor: ${formatAmbiencePercent(nextVol)}`)
  }, [ambienceVolume, muted, flash])

  // ---- status nyata dari gateway ----
  // Guard async (siklus 126 — pola sama dgn guard scene siklus 124–125):
  //  1. rid: schedule() jalan segera SETELAH tick() MULAI (bukan selesai), jadi
  //     saat gateway lambat poll berikutnya menyusul sebelum respons sebelumnya
  //     tiba → respons poll LAMA bisa tiba belakangan dan menimpa state
  //     (chip koneksi mundur ke stale, toast "Task #N berjalan" palsu muncul
  //     SETELAH toast "selesai"). Hanya respons dengan rid terbaru yang boleh
  //     menulis state/log; pemanggilan manual (doConfirm, TaskModal) ikut aman
  //     karena rid dari ref, bukan dari scheduler.
  //  2. unmount: rid di-reset di cleanup effect — respons in-flight setelah
  //     unmount (atau setelah effect lama diganti) tak menulis state/log
  //     komponen gugur. Tanpa AbortController sengaja: satu titik kebenaran
  //     (rid), tidak ada dua mekanisme yang bisa saling lolos.
  const pollRid = useRef(0)
  const refreshStatus = useCallback(async () => {
    const rid = ++pollRid.current
    try {
      const [p, t] = await Promise.all([api('tasks/paused'), api('tasks')])
      if (rid !== pollRid.current) return // poll lebih baru sudah menulis / unmount
      setPaused(!!p.paused)
      setConn(c => applyPollResult({ ...c }, { ok: true }))
      const prev = prevStatus.current
      const cur = {}
      ;(t.tasks || []).forEach(x => {
        cur[x.id] = x.status
        if (prev && prev[x.id] !== undefined && prev[x.id] !== x.status) {
          const L = { done: 'selesai', failed: 'gagal', running: 'berjalan', review: 'perlu review', pending: 'antri' }
          const d = new Date()
          pushLog({ t: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), id: x.id, status: x.status, label: L[x.status] || x.status, title: clip(x.title, 50) })
          flash(`Task #${x.id} ${L[x.status] || x.status}: ${clip(x.title, 40)}`, x.status === 'failed')
          const s = sceneRef.current
          if (s) {
            if (x.status === 'done' && s.playTaskDone) s.playTaskDone()
            else if (x.status === 'failed' && s.playTaskFail) s.playTaskFail()
          }
        }
      })
      prevStatus.current = cur
      const c = {}
      ;(t.tasks || []).forEach(x => { c[x.status] = (c[x.status] || 0) + 1 })
      setPendingCount((c.pending || 0) + (c.review || 0) + (c.failed || 0))
      setStatus(p.paused ? 'Dijeda' : `${c.running || 0} jalan · ${c.pending || 0} antri`)
      setStatusKind(p.paused || (c.running || 0) > 0 ? 'busy' : '')
    } catch {
      if (rid !== pollRid.current) return // poll lama gagal setelah poll baru sukses — abaikan
      setConn(c => applyPollResult({ ...c }, { ok: false, error: 'offline' }))
      setStatus('Gateway offline'); setStatusKind('off')
    }
  }, [flash, pushLog])
  // Polling adaptif: interval dinamis dari tracker koneksi (15s sehat,
  // backoff eksponensial 5→80s saat gagal) + penghitung ulang chip HUD agar
  // label "Sinkron N dtk lalu" berdetak tanpa menunggu poll berikutnya.
  useEffect(() => {
    let alive = true
    let timer = null
    const tick = () => {
      // offline awareness: jangan buang request saat browser tahu jaringan mati
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('Offline'); setStatusKind('off')
      } else {
        refreshStatus()
      }
    }
    const schedule = () => {
      if (!alive) return
      const delay = document.visibilityState === 'visible' ? nextPollDelay(connRef.current) : STALE_AFTER_MS
      timer = setTimeout(() => { if (!alive) return; tick(); schedule() }, Math.max(1000, delay))
    }
    tick()
    schedule()
    // segarkan label umur data tiap 5s saat koneksi bermasalah (state non-live)
    // tanpa memicu fetch; saat sehat label statis → tidak perlu re-render.
    const iv = setInterval(() => {
      setConn(c => (c && c.state !== 'live' ? { ...c } : c))
    }, 5000)
    // toast + status saat koneksi hilang / pulih
    const off = () => { setStatus('Offline'); setStatusKind('off'); flash('Koneksi terputus — menunggu jaringan', true) }
    const on = () => { flash('Koneksi kembali'); tick() }
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    return () => {
      alive = false
      clearTimeout(timer)
      clearInterval(iv)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- bump generasi rid saat unmount memang disengaja (guard async), bukan membaca snapshot ref
      pollRid.current++ // guard: respons poll in-flight setelah unmount tak menulis state
      window.removeEventListener('offline', off)
      window.removeEventListener('online', on)
    }
  }, [refreshStatus, flash])

  // ---- Wake Lock: layar kiosk kantor tidak boleh sleep saat tab terlihat ----
  // Scene 3D dipajang tanpa interaksi → browser bisa mematikan layar. Manager
  // (lib/wakelock.js, diuji unit) acquire saat mount, reacquire otomatis saat
  // tab kembali visible (browser melepas wakeLock saat hidden — perilaku spesifikasi).
  useEffect(() => {
    const wl = createWakeLockManager(typeof navigator !== 'undefined' ? navigator : null)
    wl.acquire()
    const onVis = () => { if (document.visibilityState === 'visible') wl.acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); wl.release() }
  }, [])

  // ---- judul tab dinamis: status task & jam kantor terlihat dari tab browser ----
  useEffect(() => {
    const base = 'WFS Project HQ'
    const m = { busy: '● ', off: '⚠ ', '': '' }
    document.title = `${m[statusKind] || ''}${status} — ${base}`
  }, [status, statusKind])

  // Siklus 147: chip kualitas render GPU di HUD — baca window.__perf yang di-set
  // scene tiap frame (fps/downgraded/shadowLevel/pixelRatio dari tangga adaptif
  // perf_quality). Polling 2 dtk sejajar rentang sampling FPS scene; chip hanya
  // tampil setelah sampel pertama (fps > 0), tanpa data → disembunyikan.
  const [perfChipState, setPerfChipState] = useState(null)
  useEffect(() => {
    const read = () => {
      const p = typeof window !== 'undefined' ? window.__perf : null
      const chip = perfChip(p)
      // Siklus 172: bila konteks WebGL hilang → chip TETAP tampil ("GPU
      // terputus…", state 'down') walau fps 0/kosong — perfChip menangani
      // ini di atas guard fps.
      setPerfChipState((prev) => {
        if (!chip) return null
        if (prev && prev.label === chip.label && prev.state === chip.state && prev.detail === chip.detail) return prev // hindari re-render sia-sia
        return chip
      })
    }
    read()
    const iv = setInterval(read, 2000)
    return () => clearInterval(iv)
  }, [])

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
          onStatusUpdate: (min) => setOfficePhase(min),
          onMeetingChange: (m) => setInMeeting(m),
          // Siklus 145: kamera pindah lantai TANPA agen terpilih (Fokus 3D pod
          // tim via TeamStats/TaskBoard → scene.focusTeam, fokus ruang rapat →
          // scene.focusMeetingRoom) → FloorNavigator ikut. Dulu nav tetap di
          // lantai lama — founder melihat pod L3 sementara tombol "L1" aktif.
          // Guard: selain 1–3 (null/korup) diabaikan, bukan mengarang lantai.
          onCameraFloor: (fl) => { if (fl === 1 || fl === 2 || fl === 3) setCurrentFloor(fl) },
          onSelectAgent: (ag) => {
            setSelectedAgent(ag)
            // Siklus 144: lantai sinkron kini dari posisi LIVE scene (satu
            // sumber kebenaran dgn badge AgentInspector/FloorNavigator —
            // agentLiveLevel). Dulu `ag.floor` — lantai MEJA statis yang di-set
            // sekali saat scene build (OfficeScene.js:1052): agen meja L3 yang
            // diklik saat rapat (figur L1) / makan siang kafe (L3 cafe) /
            // berjalan kampus tetap menyetel tombol "L3 · Executive" aktif,
            // padahal kamera fokus ke posisi live (agentFollowGoal/anchor
            // rapat) → label nav menunjuk lantai kosong. Entri scene tidak
            // ada (Founder nexus idx -2, scene gagal init) → fallback lama.
            // Siklus 145: lantai ini juga di-override onCameraFloor saat
            // kamera pindah TANPA agen terpilih (focusTeam/focusMeetingRoom).
            const entry = ag && findAgentLiveEntry(window.__agentData, ag.name)
            const live = agentLiveLevel(entry)
            if (live) setCurrentFloor(live)
            else if (ag && ag.floor) setCurrentFloor(ag.floor)
          },
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
          'mkt1': 'LINA', 'cs-h': 'SUPPORT', 'pm1': 'SARI',
          'ceo': 'WAHYU FS',
        }
        window.__wfsSceneSelect = (name) => {
          const s = sceneRef.current
          if (!s || !s.setSelected || !name) return
          const idMap = {}
          ;(window.__wfsAgentIdList || []).forEach(x => { idMap[x.name] = x.id })
          const mapped = SCENE_BY_ID[idMap[name]] || SCENE_BY_ID[name] || name
          const targetName = String(mapped).toUpperCase()
          if (targetName === 'WAHYU FS' || targetName === 'CEO' || targetName === 'WAHYU FAJAR S.') {
            s.setSelected(-2)
            return
          }
          const idx = (window.__agentData || []).findIndex(ad => ad.agent && String(ad.agent.name || '').toUpperCase() === targetName)
          if (idx >= 0) s.setSelected(idx)
        }
      } catch (err) {
        console.error('Scene init failed — UI-only mode:', err)
        setSceneErr(true)
        setCyberpunk(false)
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

  // ---- flag modal utk scene: Escape saat overlay terbuka TIDAK boleh reset kamera ----
  // Set saat render (bukan useEffect): update discrete-event React di-flush sinkron
  // sebelum listener window scene jalan, jadi flag pasti sudah benar saat Escape dicek.
  const modalActive = !!(showTask || confirm || ask || showHelp || showSettings || showLog || selectedAgent) || anyModalOpen()
  // Siklus 180: SATU rumus (base App-state + count panel internal) ditulis saat
  // render DAN di-refresh saat konsumsi (listener capture di bawah) — flag tak
  // lagi basi: count panel internal dibaca live, jalur tanpa render tersapu.
  wfsSetAppModalBase(!!(showTask || confirm || ask || showHelp || showSettings || showLog || selectedAgent))
  wfsRefreshModalFlag()
  window.__openSettings = () => setShowSettings(true)

  // Snapshot flag di fase CAPTURE (window capture jalan sebelum semua bubble handler):
  // handler Escape overlay menutup modal & React flush sinkron, sehingga saat handler
  // window scene (bubble) jalan flag sudah false lagi — scene wajib baca snapshot ini.
  // SIKLUS 180: listener yang sama REFRESH flag (wfsRefreshModalFlag) di fase capture
  // utk keydown/pointerdown/mousedown/pointerup. __escModalAtDispatch hanya bermakna
  // SELAMA dispatch Escape: snapshot prae-penutupan saat capture Escape, dan kini
  // DIBERSIHKAN di event non-Escape (perbaikan: dulu tertinggal true setelah Escape
  // menutup modal → guard scene memblokir orbit/shortcut sampai Escape berikutnya).
  useEffect(() => {
    const snap = (e) => {
      if (e.key === 'Escape') window.__escModalAtDispatch = window.__wfsModalOpen || anyModalOpen()
      else window.__escModalAtDispatch = false
      return wfsRefreshModalFlag()
    }
    const events = ['keydown', 'pointerdown', 'mousedown', 'pointerup']
    events.forEach((ev) => window.addEventListener(ev, snap, { capture: true }))
    return () => events.forEach((ev) => window.removeEventListener(ev, snap, { capture: true }))
  }, [])

  // ---- fokus trap: saat modal/panel App terbuka, chrome lain (HUD, Header, Ticker,
  // dock) dibuat inert — Tab tidak bisa "kabur" ke tombol di balik scrim, dan
  // screen reader tidak membacakan UI yang tertutup. (modal-scrim sudah memblokir
  // klik; inert menutup celah navigasi keyboard.) Panel dgn state internal
  // (TaskBoard/WfsPanel/CsWidget/…) juga tercakup via anyModalOpen() (useModalFlag).
  const chromeModal = modalActive
  useEffect(() => {
    // Catatan: panel-panel modal internal (Papan Task/Proyek/Statistik/…) dirender
    // DI DALAM elemen .dock. Meng-inert-kan dock utuh saat modal itu terbuka ikut
    // melumpuhkan panel modal itu sendiri (fokus .focus() diabaikan browser, klik
    // dalam panel mati). Solusi: saat modal terbuka, inert hanya diterapkan pada
    // HEADER/HUD/TICKER; di dalam dock cukup scrim (pointer-events) + fokus-trap
    // per-dialog (dialogA11y) yang sudah mengunci Tab — tombol dock tersembunyi
    // di balik scrim tidak bisa diklik maupun difokus (tak ada di urutan trap).
    const els = Array.from(document.querySelectorAll('header, .hud, .ticker'))
    els.forEach(el => { if (chromeModal) el.setAttribute('inert', ''); else el.removeAttribute('inert') })
    return () => els.forEach(el => el.removeAttribute('inert'))
  }, [chromeModal])

  const zoom = useCallback((dir) => {
    const s = sceneRef.current
    if (!s) return flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
    dir > 0 ? s.zoomIn() : s.zoomOut()
  }, [flash])

  // Siklus 179: FOTO — SATU sumber untuk tombol FOTO dock & shortcut G.
  // Snapshot PNG kanvas 3D via sceneControls.takeSnapshot (render sinkron +
  // toDataURL dalam satu tugas; hasil tak valid = flash gagal, bukan file
  // rusak diunduh diam-diam). Return true bila unduhan terpicu.
  const handleSnapshot = useCallback(() => {
    const s = sceneRef.current
    if (!s || !s.takeSnapshot) { flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true); return false }
    const r = s.takeSnapshot()
    if (!r || !r.ok) { flash('Foto gagal: ' + ((r && r.error) || 'tidak diketahui'), true); return false }
    const name = triggerSnapshotDownload(r)
    if (name) flash('Foto tersimpan: ' + name)
    return Boolean(name)
  }, [flash])

  const handleFloorSelect = useCallback((floorNum, floorId) => {
    setCurrentFloor(floorNum)
    const s = sceneRef.current
    if (s && s.focusFloor) {
      s.focusFloor(floorNum)
      flash(`Fokus ke Lantai ${floorNum}`)
    } else if (s && s.setView) {
      s.setView(floorId)
      flash(`Fokus ke Lantai ${floorNum}`)
    }
  }, [flash])

  // ---- shortcut keyboard (abaikan saat fokus di input/textarea/modal) ----
  useEffect(() => {
    const onKey = (e) => {
      let activeModal = null
      if (showSettings) activeModal = 'settings'
      else if (showHelp) activeModal = 'help'
      else if (showLog) activeModal = 'log'
      else if (typeof document !== 'undefined' && document.getElementById('task-board')) activeModal = 'task_board'
      else if (typeof document !== 'undefined' && document.getElementById('project-panel')) activeModal = 'project_panel'

      const modalOpen = Boolean(showTask || confirm || ask || showHelp || showSettings || showLog || selectedAgent || anyModalOpen())
      // Siklus 181: blokir siklus agen (C) bila modal NYATA terbuka — apa pun
      // KECUALI inspector agen (selectedAgent): inspector adalah bagian dari
      // siklus C sendiri; bila ikut dihitung, C kedua terblokir guard modal.
      const agentCycleBlocked = Boolean(showTask || confirm || ask || showHelp || showSettings || showLog || activeModal || anyModalOpen())
      const action = resolveShortcutAction(e, { modalOpen, activeModal, agentCycleBlocked })
      if (!action) return

      const actType = typeof action === 'string' ? action : action.type

      if (actType === 'TOGGLE_MUTE') {
        e.preventDefault()
        toggleMuteRef.current()
      } else if (actType === 'TOGGLE_SETTINGS') {
        e.preventDefault()
        setShowSettings(v => !v)
      } else if (actType === 'TOGGLE_LOG') {
        e.preventDefault()
        setShowLog(v => !v)
      } else if (actType === 'TOGGLE_HELP') {
        e.preventDefault()
        setShowHelp(v => !v)
      } else if (actType === 'TOGGLE_NEON') {
        e.preventDefault()
        handleCyberpunk()
      } else if (actType === 'TOGGLE_TASK_BOARD') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'))
      } else if (actType === 'CYCLE_DIV_PRESET') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wfs-cycle-div-preset', { detail: { backward: false } }))
      } else if (actType === 'CYCLE_DIV_PRESET_BACKWARD') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wfs-cycle-div-preset', { detail: { backward: true } }))
      } else if (actType === 'TOGGLE_DASHBOARD') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wfs-toggle-dashboard'))
      } else if (actType === 'TOGGLE_PROJECT_PANEL') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('wfs-toggle-project-panel'))
      } else if (actType === 'TOGGLE_AMBIENCE') {
        e.preventDefault()
        toggleAmbience(e)
      } else if (actType === 'CYCLE_AMBIENCE_VOLUME') {
        e.preventDefault()
        cycleAmbienceVolume()
      } else if (actType === 'FOCUS_FLOOR') {
        e.preventDefault()
        handleFloorSelect(action.floor, `l${action.floor}`)
      } else if (actType === 'CYCLE_FLOOR_PREV') {
        e.preventDefault()
        setCurrentFloor(prev => {
          const next = prev <= 1 ? 3 : prev - 1
          const s = sceneRef.current
          if (s && s.focusFloor) s.focusFloor(next)
          else if (s && s.setView) s.setView(`l${next}`)
          flash(`Fokus ke Lantai ${next}`)
          return next
        })
      } else if (actType === 'CYCLE_FLOOR_NEXT') {
        e.preventDefault()
        setCurrentFloor(prev => {
          const next = prev >= 3 ? 1 : prev + 1
          const s = sceneRef.current
          if (s && s.focusFloor) s.focusFloor(next)
          else if (s && s.setView) s.setView(`l${next}`)
          flash(`Fokus ke Lantai ${next}`)
          return next
        })
      } else if (actType === 'SET_VIEW') {
        e.preventDefault()
        const s = sceneRef.current
        if (s && s.setView) s.setView(action.view)
      } else if (actType === 'RESET_CAMERA') {
        e.preventDefault()
        setCurrentFloor(1)
        const s = sceneRef.current
        if (s && s.setView) { s.setView('iso'); if (s.resetFocus) s.resetFocus() }
      } else if (actType === 'TOGGLE_NAMES') {
        e.preventDefault()
        amRef.current?.toggleNames()
      } else if (actType === 'TOGGLE_ROTATE') {
        e.preventDefault()
        amRef.current?.toggleRotate()
      } else if (actType === 'TOGGLE_FULLSCREEN') {
        e.preventDefault()
        const d = document
        if (d.fullscreenElement) { d.exitFullscreen?.() } else { d.documentElement.requestFullscreen?.().catch(() => flash('Fullscreen ditolak browser', true)) }
      } else if (actType === 'ZOOM_IN') {
        zoom(1)
      } else if (actType === 'ZOOM_OUT') {
        zoom(-1)
      } else if (actType === 'TAKE_SNAPSHOT') {
        // Siklus 179: G = FOTO — delegasi ke satu sumber handleSnapshot
        // (render sinkron + unduh + flash; guards identik tombol FOTO dock)
        handleSnapshot()
      } else if (actType === 'ESCAPE') {
        setShowLog(false)
        setShowHelp(false)
        setShowSettings(false)
      } else if (actType === 'CYCLE_AGENT') {
        // Siklus 181: C/Shift+C — delegasi satu sumber sceneControls.cycleAgent
        // (goal follow + ring + bubble + inspector; panel chat sengaja tidak
        // dibuka — modal → mematikan C berikutnya; chat tetap via inspector).
        e.preventDefault()
        const s = sceneRef.current
        if (s && s.cycleAgent) s.cycleAgent(action.backward)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTask, confirm, ask, showHelp, showSettings, showLog, selectedAgent, handleCyberpunk, handleFloorSelect, zoom, flash, amRef, toggleAmbience, cycleAmbienceVolume, handleSnapshot])

  // ---- Pause / Resume nyata (konfirmasi dulu) ----
  // Guard rid (pola siklus 132/135): dialog konfirmasi bisa dibuka ulang kapan
  // pun — tombol Batal sengaja TIDAK disabled saat busy (user harus selalu bisa
  // membatalkan). Tanpa guard: respons POST pause/resume LAMA yang telat
  // (a) menutup dialog BARU lewat setConfirm(null), (b) menaikkan toast basi
  // ("Dijeda/HTTP 503") di atas generasi baru, (c) finally-nya menghapus busy
  // milik generasi baru. Setiap buka/tutup dialog menaikkan rid → semua respons
  // in-flight generasi sebelumnya jadi basi dan busy di-reset (dialog baru
  // langsung siap). Server-side POST tetap sudah terkirim — yang dibatalkan
  // hanya penulisannya ke UI.
  const confirmRid = useRef(0)
  const openConfirm = (mode) => { ++confirmRid.current; setConfirmBusy(false); setConfirm(mode) }
  const closeConfirm = () => { ++confirmRid.current; setConfirmBusy(false); setConfirm(null) }
  const doConfirm = async () => {
    const rid = ++confirmRid.current
    setConfirmBusy(true)
    try {
      if (confirm === 'pause') {
        const d = await api('tasks/pause_all', { method: 'POST', body: {} })
        if (rid !== confirmRid.current) return // dialog sudah generasi baru / ditutup
        flash(`Dijeda — ${d.cancelled} proses dihentikan, ${d.reset} task kembali pending`)
      } else {
        const d = await api('tasks/resume_all', { method: 'POST', body: {} })
        if (rid !== confirmRid.current) return
        flash(`Dilanjutkan — ${d.started.length} task dijalankan`)
      }
      if (rid !== confirmRid.current) return
      setConfirm(null); refreshStatus()
    } catch (e) {
      if (rid !== confirmRid.current) return // kegagalan basi: jangan toast / tutup dialog baru
      flash(e.message, true); setConfirm(null)
    } finally {
      if (rid === confirmRid.current) setConfirmBusy(false) // jangan hapus busy generasi baru
    }
  }

  const formatTime = (min) => {
    const h = Math.floor(min / 60), m = Math.floor(min % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const connBadge = connectionBadge(conn)

  return (
    <>
      <div ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} aria-hidden="true" />
      {!sceneReady && !sceneErr && <div className="scene-loading" role="status">Memuat ruangan…</div>}
      {sceneErr && <div className="scene-loading err" role="alert">Scene 3D tidak aktif — mode UI saja. Muat ulang halaman untuk mencoba lagi.</div>}
      <div className="vignette" aria-hidden="true" />

      <SkipLink />
      <Header />
      <SysMeter />
      <Ticker conn={connBadge} />
      <FloorNavigator currentFloor={currentFloor} onSelectFloor={handleFloorSelect} />

      {inMeeting && <div className="meeting-badge" role="status"><div><i />Rapat berlangsung</div></div>}

      <HUD
        time={formatTime(time)}
        timeValue={time}
        status={status}
        statusKind={statusKind}
        conn={connBadge}
        perf={perfChipState}
        onTimeChange={handleTimeChange}
        phase={officePhase}
        ambienceEnabled={ambienceEnabled}
        ambienceVolume={ambienceVolume}
        muted={muted}
        onToggleAmbience={toggleAmbience}
        onCycleAmbienceVolume={cycleAmbienceVolume}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Dock bawah: satu bilah, tidak ada elemen saling tumpuk. */}
      <div className="dock" role="toolbar" aria-label="Menu utama">
        <QuickToolbar
          paused={paused}
          onAddTask={() => setShowTask(true)}
          onPauseAll={() => openConfirm('pause')}
          onResumeAll={() => openConfirm('resume')}
          onToggleTheme={handleCyberpunk}
          theme={!cyberpunk}
          onZoomIn={() => zoom(1)}
          onZoomOut={() => zoom(-1)}
          onGoHome={() => {
            // Siklus 176: padanan mobile Escape — reset fokus + hapus seleksi.
            const s = sceneRef.current
            if (s && s.resetFocus) s.resetFocus()
            setSelectedAgent(null)
          }}
          onSnapshot={() => {
            // Siklus 179: delegasi satu sumber handleSnapshot (sama dgn shortcut G)
            handleSnapshot()
          }}
          onCycleAgent={(backward) => {
            // Siklus 182: tombol AGEN — delegasi satu sumber sceneControls.cycleAgent
            // (sama dgn shortcut C; goal follow + ring + bubble + inspector).
            const s = sceneRef.current
            if (s && s.cycleAgent) s.cycleAgent(backward === true)
          }}
          onSetView={(v) => {
            const s = sceneRef.current
            if (!s || !s.setView) return flash('Scene 3D tidak aktif (WebGL tidak tersedia)', true)
            s.setView(v)
          }} />
        <span className="sep" />
        <ActionMenu sceneRef={sceneRef} onFlash={flash} actionMenuRef={actionMenuApi} onOpenSettings={() => setShowSettings(true)} />
        <TaskBoard onFlash={flash} onAsk={setAsk} />
        <Dashboard onOpenBoard={() => window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }))} onOpenProjects={() => window.dispatchEvent(new CustomEvent('wfs-open-project-panel', { detail: {} }))} />
        <ProjectPanel />
        <TeamStats />
        <button className="ibtn" onClick={toggleMute} onContextMenu={(e) => { e.preventDefault(); setShowSettings(true) }} title={muted ? 'Nyalakan suara notifikasi (shortcut M) — Klik kanan untuk opsi volume' : 'Bisukan suara notifikasi (shortcut M) — Klik kanan untuk opsi volume'} aria-label={muted ? 'Nyalakan suara' : 'Bisukan suara'} aria-pressed={muted}>
          <span className="ic">
            {muted ? <><IconVolumeMute size={19} /><span className="sr-only">🔇</span></> : <><IconVolume size={19} /><span className="sr-only">🔊</span></>}
          </span>
          <span className="lb">{muted ? 'Suara Mati' : 'Suara'}</span>
        </button>
        <button className="ibtn" onClick={() => setShowLog(true)} title="Log aktivitas kantor — shortcut L" aria-label="Log aktivitas">
          <span className="ic"><IconScroll size={19} /><span className="sr-only">📜</span></span>
          <span className="lb">Log</span>
        </button>
        <span className="sep" />
        <WfsPanel />
        <Suspense fallback={null}><CsWidget /></Suspense>
        <button className="ibtn" onClick={() => setShowConsole(true)} title="Konsol Software House (Overview · Projects · Buat project)" aria-label="Konsol Software House">
          <span className="ic"><span aria-hidden="true">🖥️</span><span className="sr-only">🖥️</span></span>
          <span className="lb">Konsol</span>
        </button>
        <button className="ibtn" onClick={() => setShowSettings(true)} title="Pengaturan audio & tampilan kantor — shortcut O" aria-label="Pengaturan">
          <span className="ic"><IconGear size={19} /><span className="sr-only">⚙️</span></span>
          <span className="lb">Atur</span>
        </button>
        <button className="ibtn" onClick={() => setShowHelp(true)} title="Panduan penggunaan kantor — shortcut H atau ?" aria-label="Bantuan">
          <span className="ic"><IconHelp size={19} /><span className="sr-only">❔</span></span>
          <span className="lb">Bantuan</span>
        </button>
      </div>

      <AgentInspector
        agent={selectedAgent}
        onClose={handleCloseInspector}
        onFocusFloor={(fl) => handleFloorSelect(fl, `l${fl}`)}
        onOpenConsole={() => setShowConsole(true)}
        onChatWith={(ag) => {
          if (window.__wfsSelectAgent) {
            const idMap = {}
            ;(window.__wfsAgentIdList || []).forEach(x => { idMap[x.name] = x.id })
            const gid = (ag.name === 'Wahyu FS' || ag.name === 'Wahyu Fajar Setiawan') ? 'ceo' : (idMap[ag.name] || ag.name)
            window.__wfsSelectAgent(gid)
          }
        }}
      />

      <ActivityLog show={showLog} items={logItems} onClose={() => setShowLog(false)} onClear={clearLog} />
      <ShConsole show={showConsole} onClose={() => setShowConsole(false)} />
      <SettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        sceneRef={sceneRef}
        muted={muted}
        onToggleMute={toggleMute}
        cyberpunk={cyberpunk}
        onToggleTheme={handleCyberpunk}
        onFlash={flash}
      />
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
        onConfirm={doConfirm} onCancel={closeConfirm} />

      <ConfirmModal show={!!ask} title={ask?.title} text={ask?.body} confirmLabel={ask?.ok}
        onConfirm={() => { const f = ask.onOk; setAsk(null); f() }} onCancel={() => setAsk(null)} />

      {toast && <div className={'toast' + (toast.err ? ' err' : '')} role={toast.err ? 'alert' : 'status'} aria-live={toast.err ? 'assertive' : 'polite'}>{toast.msg}</div>}
    </>
  )
}
