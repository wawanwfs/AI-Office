/**
 * kanban_drag.js — Utilitas murni interaksi drag-and-drop & responsivitas papan Kanban.
 * Menyediakan setup data transfer, validasi perpindahan kolom, resolusi status,
 * serta kalkulasi adaptif layout mobile drawer.
 */

/**
 * Pemetaan antara kunci kolom Kanban UI dan status model Task.
 */
export const KANBAN_COL_TO_STATUS = Object.freeze({
  todo: 'pending',
  in_progress: 'in_progress',
  review: 'review',
  done: 'completed',
})

/**
 * Pemetaan status Task model ke kolom Kanban UI.
 */
export const STATUS_TO_KANBAN_COL = Object.freeze({
  pending: 'todo',
  todo: 'todo',
  in_progress: 'in_progress',
  progress: 'in_progress',
  review: 'review',
  completed: 'done',
  done: 'done',
})

/**
 * Menyiapkan payload data transfer saat kartu Kanban mulai di-drag.
 * @param {DataTransfer|object} dataTransfer
 * @param {object} task
 * @returns {boolean}
 */
export function setupCardDragData(dataTransfer, task) {
  if (!dataTransfer || !task || task.id == null) return false

  try {
    dataTransfer.setData('text/plain', String(task.id))
  } catch {
    // Abaikan jika dataTransfer mock parsial
  }

  try {
    const payload = JSON.stringify({
      id: task.id,
      title: task.title || '',
      status: task.status || 'pending',
      priority: task.priority || 'normal',
    })
    dataTransfer.setData('application/json', payload)
  } catch {
    // Beberapa browser/lingkungan pengujian membatasi mime-type kustom
  }

  try {
    dataTransfer.effectAllowed = 'move'
  } catch {
    // Setter fallback
  }

  return true
}

/**
 * Memeriksa apakah suatu task dapat di-drop pada kolom tujuan.
 * Mengembalikan false jika kartu sudah berada di kolom tersebut.
 * @param {object} task
 * @param {string} targetColKey
 * @returns {boolean}
 */
export function canDropTaskInColumn(task, targetColKey) {
  if (!task || !targetColKey) return false
  const currentStatus = String(task.status || 'pending').toLowerCase()
  const currentCol = STATUS_TO_KANBAN_COL[currentStatus] || 'todo'
  return currentCol !== targetColKey
}

/**
 * Menyelesaikan status task baru berdasarkan kunci kolom tujuan.
 * @param {string} targetColKey
 * @returns {string}
 */
export function resolveNewStatusForColumn(targetColKey) {
  if (!targetColKey) return 'pending'
  return KANBAN_COL_TO_STATUS[targetColKey] || targetColKey
}

/**
 * Format pesan notifikasi flash saat task berhasil dipindahkan.
 * @param {object} task
 * @param {string} targetColKey
 * @param {string} [colLabel]
 * @returns {string}
 */
export function formatDragDropNotification(task, targetColKey, colLabel) {
  if (!task || task.id == null) return ''
  const label = colLabel || targetColKey || 'baru'
  return `Task #${task.id} dipindahkan ke kolom ${label}`
}

/**
 * Menghitung lebar kolom adaptif untuk scroll horizontal pada layar mobile / responsive drawer.
 * @param {number} containerWidth - Lebar viewport atau kontainer (px)
 * @param {number} [columnCount=4] - Jumlah total kolom kanban
 * @returns {number}
 */
export function calcMobileColumnWidth(containerWidth, columnCount = 4) {
  if (typeof containerWidth !== 'number' || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 170
  }
  const cols = Math.max(1, Number.isFinite(columnCount) ? columnCount : 4)

  if (containerWidth < 480) {
    // Layar HP sangat sempit (misal 360px - 414px): kolom lebar 78% viewport agar kartu nyaman dibaca
    const target = Math.round(containerWidth * 0.78)
    return Math.max(220, Math.min(300, target))
  }

  if (containerWidth < 768) {
    // Layar tablet kecil / phablet: kolom sekitar 45% viewport
    const target = Math.round(containerWidth * 0.45)
    return Math.max(180, Math.min(260, target))
  }

  // Layar desktop / lebar: bagi merata dengan batas minimal 160px
  return Math.max(160, Math.floor(containerWidth / cols))
}
