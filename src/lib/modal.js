import { useEffect } from 'react'

/* Flag modal TERPUSAT: setiap overlay yang ditutup dengan Escape wajib mendaftar
 * di sini, agar scene tahu kapan Escape TIDAK boleh me-reset kamera.
 * (window.__wfsModalOpen di App hanya mencakup modal yang state-nya di App;
 * panel-panel dengan state internal seperti TaskBoard/ProjectPanel/WfsPanel/
 * TeamStats/CsWidget/TaskModal memakai hook ini.) */
let count = 0

export function useModalFlag(open) {
  useEffect(() => {
    if (!open) return
    count++
    return () => { count-- }
  }, [open])
}

export const anyModalOpen = () => count > 0
