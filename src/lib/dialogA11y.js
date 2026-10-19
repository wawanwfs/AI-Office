/* Util a11y overlay: pasang aria-modal + pindahkan fokus ke elemen pertama
 * yang bisa difokuskan saat overlay terbuka, lalu kunci Tab di dalam dialog
 * (fokus trap per-dialog; chrome luar sudah inert via App). */
import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
