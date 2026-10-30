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

/* REFRESH FLAG SAAT KONSUMSI (siklus 180): flag modal di-refresh di momen tepat
 * sebelum dibaca (listener capture-phase App utk keydown/pointerdown/mousedown/
 * pointerup). Dua sumber: __wfsAppModalBase (modal state-nya App, ditulis saat
 * render — nilai render terakhir) + anyModalOpen() (panel internal, dibaca LIVE
 * saat konsumsi). Menyembuhkan dua kelas flag basi:
 *  (1) panel internal dibuka → useModalFlag menaikkan count DI EFFECT setelah
 *      render menulis flag (count bukan state → tak ada re-render) → flag false
 *      basi selagi panel terbuka — kini terbaca live saat guard scene membaca;
 *  (2) jalur setState via ref (onSelectAgent null dari scene.resetFocus) tanpa
 *      render tepat waktu → flag true basi mematikan shortcut (temuan 179).
 * Catatan: fungsi ini TIDAK menyentuh __escModalAtDispatch — flag itu hanya
 * bermakna selama dispatch Escape dan dikelola listener App (snapshot saat
 * capture Escape, dibersihkan di event non-Escape — bukan di sini, agar tak
 * pernah "sticky true"). */
export function wfsSetAppModalBase(v) { window.__wfsAppModalBase = !!v }

export function wfsRefreshModalFlag() {
  window.__wfsModalOpen = window.__wfsAppModalBase === true || anyModalOpen()
  return window.__wfsModalOpen
}
