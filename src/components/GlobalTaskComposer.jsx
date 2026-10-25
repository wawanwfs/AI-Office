import React, { useState, useEffect, useRef } from 'react'
import { IconClose, IconRocket } from './Icons'

const PROJECT_TYPES = [
  { id: 'website', label: 'Website / Landing Page', desc: 'Modern responsive website dengan Tailwind & HTML5' },
  { id: 'webapp', label: 'Web Application / SaaS', desc: 'SaaS dashboard, autentikasi, dan reactive interface' },
  { id: 'api', label: 'REST API & Backend', desc: 'RESTful API service dengan schema dan automated test' },
  { id: 'bugfix', label: 'Bug Fixing & Audit', desc: 'Investigasi error, diagnosis root cause, dan perbaikan' },
  { id: 'security', label: 'Security & Vulnerability', desc: 'Security audit, privilege isolation, dan hardening' },
  { id: 'testing', label: 'Test Suite Automation', desc: 'Authoring unit, integration, dan regression test' }
]

const TECH_STACKS = [
  'Auto-Select (Recommended)',
  'HTML5 / TailwindCSS / Vanilla JS',
  'React + Vite + Modern CSS',
  'Python FastAPI + SQLite / REST',
  'Node.js Express + Static Web'
]

export default function GlobalTaskComposer({ open, onClose, onProjectCreated }) {
  const [instruction, setInstruction] = useState('')
  const [projectName, setProjectName] = useState('')
  const [taskType, setTaskType] = useState('website')
  const [techStack, setTechStack] = useState(TECH_STACKS[0])
  const [execMode, setExecMode] = useState('direct') // 'direct' or 'plan'
  const [busy, setBusy] = useState(false)
  const [planResult, setPlanResult] = useState(null)
  const [error, setError] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setInstruction('')
      setProjectName('')
      setPlanResult(null)
      setError(null)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const handlePlanOrExecute = async (mode) => {
    if (!instruction.trim()) {
      setError('Harap masukkan instruksi tugas.')
      return
    }
    setBusy(true)
    setError(null)

    try {
      // 1. Submit to /api/tasks to plan
      const planRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          project_name: projectName || undefined,
          task_type: taskType,
          tech_stack: techStack.includes('Auto') ? undefined : techStack
        })
      })

      if (!planRes.ok) throw new Error(`Gagal menyusun rencana (HTTP ${planRes.status})`)
      const planData = await planRes.json()
      setPlanResult(planData)

      // If direct execution requested, run execute immediately
      if (mode === 'direct' || execMode === 'direct') {
        const execRes = await fetch(`/api/tasks/${planData.task_id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        if (!execRes.ok) throw new Error(`Gagal eksekusi tugas (HTTP ${execRes.status})`)
        const execData = await execRes.json()

        if (onProjectCreated) onProjectCreated(execData.project)
        onClose()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleExecuteNow = async () => {
    if (!planResult?.task_id) return
    setBusy(true)
    setError(null)
    try {
      const execRes = await fetch(`/api/tasks/${planResult.task_id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!execRes.ok) throw new Error(`Gagal eksekusi tugas (HTTP ${execRes.status})`)
      const execData = await execRes.json()
      if (onProjectCreated) onProjectCreated(execData.project)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        className="w-full max-w-2xl bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <IconRocket size={20} />
            </span>
            <div>
              <h2 id="composer-title" className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                <span>WFS PROJECT</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">GLOBAL TASK COMPOSER</span>
              </h2>
              <p className="text-xs text-slate-400">Berikan instruksi pengembangan perangkat lunak kepada 11 AI Agents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Tutup dialog"
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Prompt Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Instruksi Proyek (Bahasa Indonesia / English) *
            </label>
            <textarea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Contoh: Buatkan website company profile modern untuk WFS PROJECT dengan TailwindCSS, responsive mobile, dark mode, dan deploy di Docker sandbox..."
              className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition font-sans resize-none"
            />
          </div>

          {/* Project Name (Optional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Nama Proyek (Opsional)
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Auto-generated jika dikosongkan"
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Pilihan Tech Stack
              </label>
              <select
                value={techStack}
                onChange={(e) => setTechStack(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 transition"
              >
                {TECH_STACKS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Project Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Kategori Pekerjaan
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {PROJECT_TYPES.map(pt => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setTaskType(pt.id)}
                  className={`text-left p-3 rounded-xl border transition ${
                    taskType === pt.id
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm shadow-emerald-500/10'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-white mb-0.5">{pt.label}</div>
                  <div className="text-[11px] text-slate-400 leading-tight">{pt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Plan Preview Result if available */}
          {planResult && (
            <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                <span>✓ RENCANA TUGAS TERSUSUN ({planResult.subtasks?.length} SUBTASKS)</span>
                <span>PROYEK: {planResult.project?.slug}</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {planResult.subtasks?.map((st, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-slate-300">{i + 1}. {st.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{st.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="radio"
                name="execMode"
                value="direct"
                checked={execMode === 'direct'}
                onChange={() => setExecMode('direct')}
                className="accent-emerald-500"
              />
              <span>Langsung Eksekusi</span>
            </label>
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="radio"
                name="execMode"
                value="plan"
                checked={execMode === 'plan'}
                onChange={() => setExecMode('plan')}
                className="accent-emerald-500"
              />
              <span>Rencana Dulu</span>
            </label>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition"
            >
              Batal
            </button>

            {planResult ? (
              <button
                type="button"
                onClick={handleExecuteNow}
                disabled={busy}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
              >
                {busy ? 'Mengeksekusi…' : 'Mulai Eksekusi Sekarang'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handlePlanOrExecute(execMode)}
                disabled={busy}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
              >
                {busy ? 'Memproses…' : (execMode === 'direct' ? 'Deploy ke Sandbox' : 'Susun Rencana')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
