/* Util a11y overlay: pasang aria-modal + pindahkan fokus ke elemen pertama
 * yang bisa difokuskan saat overlay terbuka, lalu kunci Tab di dalam dialog
 * (fokus trap per-dialog; chrome luar sudah inert via App). */
import { useEffect } from 'react'
import { useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Siklus 333: Escape-tutup overlay SATU sumber — lima komponen dulu punya
 * salinan handler `if (e.key === 'Escape') setOpen(false)` masing-masing
 * (rawan drift: menambah guard input/stopPropagation berarti edit 5 tempat).
 * Pakai onCloseRef agar pemanggil tak perlu memo onClose. */
export function useEscapeClose(open, onClose, { stopPropagation = false } = {}) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const k = (e) => { if (e.key === 'Escape') { if (stopPropagation) e.stopPropagation(); onCloseRef.current() } }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [open, stopPropagation])
}

/* Siklus 335: klik-di-luar SATU sumber — useOutsideClose(open, ref, onClose).
 * Dua salinan handler pointerdown (QuickToolbar, ActionMenu) dihapus. */
export function useOutsideClose(open, ref, onClose) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const c = (e) => { if (ref.current && !ref.current.contains(e.target)) onCloseRef.current() }
    document.addEventListener('pointerdown', c)
    return () => { document.removeEventListener('pointerdown', c) }
  }, [open, ref])
}

/* Siklus 336: pasang event kustom window SATU sumber — useWindowEvent(type,
 * handler). Enam salinan add/removeEventListener pasangan (TaskBoard ×3,
 * ProjectPanel ×2, Dashboard ×1) dihapus. Handler via ref agar pemanggil
 * tak perlu memo; enabled=false melewati pemasangan. */
export function useWindowEvent(type, handler, { enabled = true } = {}) {
  const hRef = useRef(handler)
  useEffect(() => { hRef.current = handler })
  useEffect(() => {
    if (!enabled) return
    const h = (e) => hRef.current(e)
    window.addEventListener(type, h)
    return () => window.removeEventListener(type, h)
  }, [type, enabled])
}

export function useDialogA11y({ open, onClose, ref, initialFocus }) {
  useEffect(() => {
    if (!open) return
    // simpan pemicu (tombol/shortcut yang membuka) utk dikembalikan saat tutup
    const trigger = document.activeElement
    const el = ref && ref.current
    if (el) {
      if (el.getAttribute('role') === 'dialog' && !el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true')
      const f = (initialFocus && initialFocus.current) || el.querySelector(FOCUSABLE) || el
      const t = setTimeout(() => f.focus && f.focus(), 30)
      const k = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose() }
        else if (e.key === 'Tab' && el) {
          const items = Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement)
          if (!items.length) return
          const i = items.indexOf(document.activeElement)
          const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 || i < 0 ? 0 : i + 1)
          e.preventDefault(); items[next].focus()
        }
      }
      document.addEventListener('keydown', k, true)
      return () => {
        clearTimeout(t)
        document.removeEventListener('keydown', k, true)
        // aria-modal & fokus restore: kembalikan fokus ke pemicu bila masih valid
        el.removeAttribute('aria-modal')
        if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
          try { trigger.focus() } catch { /* noop */ }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref/initialFocus stabil
  }, [open, onClose])
}
