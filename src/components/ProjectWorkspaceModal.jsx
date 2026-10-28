import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'
import { IconClose, IconRocket } from './Icons'

const WORKSPACE_TABS = [
  { id: 'preview', label: 'Live Preview' },
  { id: 'files', label: 'File Explorer' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'tests', label: 'Quality & QA' },
]

// Navigasi panah tablist (pola WAI-ARIA tabs): Left/Right/Home/End memindahkan
// fokus antar tab; Tab keluar seperti biasa (roving tabindex di render).
const workspaceTabKeys = (e, setTab) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  const ids = WORKSPACE_TABS.map(t => t.id)
  const cur = document.activeElement?.id || ''
  const i = Math.max(0, ids.indexOf(cur.startsWith('pw-tab-') ? cur.slice(8) : ''))
  let n
  if (e.key === 'Home') n = 0
  else if (e.key === 'End') n = ids.length - 1
  else n = e.key === 'ArrowRight' ? (i + 1) % ids.length : (i - 1 + ids.length) % ids.length
  e.preventDefault(); setTab(ids[n])
  setTimeout(() => { const el = document.getElementById('pw-tab-' + ids[n]); if (el) el.focus() }, 0)
}

// A new project/open session must never inherit another workspace's editor or requests.
export default function ProjectWorkspaceModal(props) {
  if (!props.open || !props.project) return null
  return <WorkspaceSession key={props.project.id} {...props} />
}

function WorkspaceSession({ project, open, onClose, onRefreshProject }) {
  const [activeTab, setActiveTab] = useState('preview') // 'preview' | 'files' | 'terminal' | 'tests'
  const [files, setFiles] = useState([])
  const [filesState, setFilesState] = useState('loading')
  const [fileReady, setFileReady] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const [fileError, setFileError] = useState('')
  const [selectedFile, setSelectedFile] = useState('index.html')
  const [fileContent, setFileContent] = useState('')
  const [savingFile, setSavingFile] = useState(false)
  const [termCmd, setTermCmd] = useState('python3 -m unittest test_app.py')
  const [termOutput, setTermOutput] = useState('')
  const [termBusy, setTermBusy] = useState(false)
  const [containerBusy, setContainerBusy] = useState(false)
  const [previewKey, setPreviewKey] = useState(1)

  const pid = project?.id
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // a11y: Escape menutup, fokus masuk ke dialog & terkunci di dalamnya
  // (paritas dgn modal lain yang pakai useDialogA11y).
  const box = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const closeViaA11y = useCallback(() => onCloseRef.current(), [])
  useDialogA11y({ open, onClose: closeViaA11y, ref: box })

  // Load file list
  const loadFiles = useCallback(async () => {
    if (!pid) return
    setFilesState('loading')
    try {
      const res = await fetch(`/api/projects/${pid}/files`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFiles(data.files || [])
      setFilesState('ready')
    } catch { setFilesState('error'); setFiles([]) }
  }, [pid])

  const fileRequest = useRef(0)
  useEffect(() => () => { fileRequest.current += 1 }, [])

  // Load selected file content; only the newest selection/retry may update the editor.
  const loadFileContent = useCallback(async (path) => {
    if (!pid || !path) return
    const request = ++fileRequest.current
    setFileReady(false)
    setFileContent('')
    setFileError('')
    try {
      const res = await fetch(`/api/projects/${pid}/file?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (request !== fileRequest.current) return
      setFileContent(data.content || '')
      setFileReady(true)
    } catch {
      if (request === fileRequest.current) setFileError('Gagal memuat isi file. Pilih file lagi untuk mencoba ulang.')
    }
  }, [pid])

  useEffect(() => {
    if (open && pid) {
      const t = setTimeout(loadFiles, 0)
      return () => clearTimeout(t)
    }
  }, [open, pid, loadFiles])

  useEffect(() => {
    if (open && pid && selectedFile && activeTab === 'files') {
      const t = setTimeout(() => { loadFileContent(selectedFile) }, 0)
      return () => { clearTimeout(t); fileRequest.current += 1 }
    }
  }, [open, pid, selectedFile, activeTab, loadFileContent])

  if (!open || !project) return null

  const handleSaveFile = async () => {
    if (!pid || !selectedFile || !fileReady || savingFile) return
    setSavingFile(true)
    setWorkspaceError('')
    try {
      const response = await fetch(`/api/projects/${pid}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFile, content: fileContent })
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setPreviewKey(k => k + 1)
    } catch { setWorkspaceError('Gagal menyimpan. Isi editor tetap tersedia; coba simpan lagi setelah koneksi pulih.') }
    setSavingFile(false)
  }

  const handleRunTerminal = async (e) => {
    if (e) e.preventDefault()
    if (!pid || !termCmd.trim()) return
    setTermBusy(true)
    try {
      const res = await fetch(`/api/projects/${pid}/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: termCmd })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTermOutput(`$ ${termCmd}\n` + (data.stdout || '') + (data.stderr || '') + `\n[Exit Code: ${data.exit_code}]`)
    } catch (err) {
      setTermOutput(`[Error executing]: ${err.message}`)
    }
    setTermBusy(false)
  }

  const handleContainerAction = async (action) => {
    if (!pid) return
    setContainerBusy(true)
    setWorkspaceError('')
    try {
      const response = await fetch(`/api/projects/${pid}/container/${action}`, { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (!mounted.current) return
      if (onRefreshProject) onRefreshProject()
      setPreviewKey(k => k + 1)
    } catch { setWorkspaceError('Restart gagal. Periksa koneksi lalu coba lagi.') }
    setContainerBusy(false)
  }

  const previewUrl = project.preview_url || `/preview/${pid}/`

  return (
    <div className="workspace-overlay fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-title"
        className="workspace-dialog w-full max-w-6xl h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-sm"
      >
        {/* Workspace Top Bar */}
        <div className="workspace-header flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <IconRocket size={18} />
            </span>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 id="workspace-title" className="text-base font-bold text-white tracking-wide">{project.name}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase font-semibold ${
                  project.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'
                }`}>
                  {project.status || 'READY'}
                </span>
                {project.preview_port && (
                  <span className="text-[11px] text-slate-400 font-mono">PORT: {project.preview_port}</span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-md">{project.workspace_path}</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div role="tablist" aria-label="Tab workspace" className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800" onKeyDown={e => workspaceTabKeys(e, setActiveTab)}>
            {WORKSPACE_TABS.map(tab => (
              <button
                key={tab.id}
                id={`pw-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`pw-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Close & Container Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleContainerAction('restart')}
              disabled={containerBusy}
              title="Restart Docker Container"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition"
            >
              Restart
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Tutup Workspace"
            >
              <IconClose size={18} />
            </button>
          </div>
        </div>

        {workspaceError && <div role="alert">{workspaceError}</div>}
        {/* Tab Content Panes */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-950/30">
          {/* TAB 1: LIVE PREVIEW */}
          {activeTab === 'preview' && (
            <div role="tabpanel" id="pw-panel-preview" aria-labelledby="pw-tab-preview" className="flex-1 flex flex-col h-full">
              <div className="px-6 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-white">{previewUrl}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setPreviewKey(k => k + 1)}
                    className="hover:text-emerald-400 transition"
                  >
                    ↻ Refresh
                  </button>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition flex items-center gap-1 font-sans text-xs font-semibold"
                  >
                    Open in New Tab ↗
                  </a>
                </div>
              </div>
              <div className="flex-1 bg-white relative">
                <iframe
                  key={previewKey}
                  src={previewUrl}
                  title="WFS Project Sandbox Live Preview"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          )}

          {/* TAB 2: FILE EXPLORER & EDITOR */}
          {activeTab === 'files' && (
            <div role="tabpanel" id="pw-panel-files" aria-labelledby="pw-tab-files" className="flex-1 flex overflow-hidden">
              <div className="w-64 border-r border-slate-800 bg-slate-950/70 p-4 overflow-y-auto">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Project Workspace</div>
                <div className="space-y-1">
                  {filesState === 'loading' && <p role="status">Memuat daftar file…</p>}
                  {filesState === 'error' && <div role="alert">Gagal memuat daftar file. <button onClick={loadFiles}>Coba lagi</button></div>}
                  {filesState === 'ready' && files.length === 0 && <p>Belum ada file.</p>}
                  {files.map(f => (
                    <button
                      key={f}
                      onClick={() => { fileRequest.current += 1; setFileReady(false); setFileContent(''); setSelectedFile(f); if (f === selectedFile) loadFileContent(f) }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono truncate transition ${
                        selectedFile === f ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                      }`}
                    >
                      📄 {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 flex flex-col bg-slate-900">
                <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
                  <span className="font-mono text-xs text-emerald-400">{selectedFile}</span>
                  <button
                    onClick={handleSaveFile}
                    disabled={savingFile || !fileReady || filesState !== 'ready'}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                  >
                    {savingFile ? 'Menyimpan…' : 'Simpan Perubahan'}
                  </button>
                </div>
                {fileError && <p role="alert">{fileError}</p>}
                <textarea
                  disabled={!fileReady}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  aria-label={`Isi file ${selectedFile}`}
                  className="flex-1 p-6 bg-slate-950/90 text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 3: TERMINAL */}
          {activeTab === 'terminal' && (
            <div role="tabpanel" id="pw-panel-terminal" aria-labelledby="pw-tab-terminal" className="flex-1 flex flex-col p-6 font-mono text-xs bg-slate-950">
              <div className="text-slate-400 mb-3">WFS PROJECT ISOLATED SANDBOX TERMINAL — HOST: DOCKER RUNTIME</div>
              <div className="flex-1 p-4 rounded-xl bg-slate-900/90 border border-slate-800 overflow-y-auto text-slate-200 mb-4 whitespace-pre-wrap">
                {termOutput || 'Siap menerima perintah shell. Contoh: python3 -m unittest test_app.py'}
              </div>
              <form onSubmit={handleRunTerminal} className="flex gap-2">
                <input
                  type="text"
                  value={termCmd}
                  onChange={(e) => setTermCmd(e.target.value)}
                  aria-label="Perintah terminal"
                  placeholder="Ketik perintah (misal: ls -la, python3 test_app.py)"
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={termBusy}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
                >
                  {termBusy ? 'Menjalankan…' : 'Jalankan'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: QUALITY & QA REPORT */}
          {activeTab === 'tests' && (
            <div role="tabpanel" id="pw-panel-tests" aria-labelledby="pw-tab-tests" className="flex-1 p-8 overflow-y-auto space-y-6">
              <div className="max-w-3xl mx-auto space-y-6">
                <h3>Automated QA & Security Gate</h3>
                <p role="status">Belum ada hasil QA terverifikasi.</p>
                <p>Status container dan URL preview bukan bukti pengujian atau audit keamanan. Jalankan pengujian di Terminal untuk melihat output dan exit code aktual.</p>
                <button className="btn" onClick={() => { setActiveTab('terminal'); setTimeout(() => document.getElementById('pw-tab-terminal')?.focus(), 0) }}>Buka Terminal</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
