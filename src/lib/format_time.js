/**
 * Formatter jam ringkas untuk UI React (siklus 270).
 * Di sini karena react-refresh melarang file komponen mengekspor fungsi
 * non-komponen — dan formatter waktu bersama harus satu sumber.
 *
 * ANTI-POISONING stempel log Dashboard: dulu `new Date(ts*1000)` telanjang —
 * ts null → "Invalid Date" dilukis di panel, ts 0/-100 → "08.00" palsu,
 * string ISO → NaN×1000 → Invalid. Kini parseTimestampMs (null/NaN/±Inf/
 * 'invalid'/Date NaN → NULL, detik-UNIX <1e10 auto ×1000, ISO diparsing)
 * + guard epoch (≤0 → '') → jam 'HH.MM' valid atau '' murni.
 */
import { parseTimestampMs } from './kanban_date.js'

/** Siklus 359: satu sumber nama bulan singkat ID (dipindah dari kanban_date). */
export const MONTH_NAMES_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export function fmtTime(ts) {
  const ms = parseTimestampMs(ts)
  if (ms == null || ms <= 0) return ''
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Siklus 344: satu sumber format angka µUSD 'id-ID'.
 * Anti-poisoning: nilai null/undefined/NaN/Infinity -> null
 * (pemanggil memutuskan fallback, tidak melukis "NaN" di panel).
 */
export function fmtMicroUSD(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v.toLocaleString('id-ID')
}

/**
 * Siklus 345: satu sumber stempel 'HH.MM.SS' id-ID dari timestamp.
 * Pengganti salinan `new Date(ts).toLocaleTimeString('id-ID')` di scene/parts
 * (tv_canvas & projectboard). Anti-poisoning: masukan Date/number/timestamp
 * detik-UNIX <1e10 auto ×1000 (paritas parseTimestampMs); tidak valid → null
 * (pemanggil memutuskan fallback, tidak melukis "Invalid Date").
 */
export function fmtStampId(ts) {
  const ms = parseTimestampMs(ts)
  if (ms == null || ms <= 0) return null
  return new Date(ms).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Siklus 358: satu sumber 'YYYY-MM-DD' dari Date (nama snapshot & ekspor kanban).
 * Anti-poisoning: non-Date / Date rusak → null (pemanggil pakai fallback). */
export function isoDateFromDate(d) {
  if (typeof d?.getTime !== 'function' || Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Siklus 359: satu sumber 'D MMM YYYY' Indonesia (mis. '26 Okt 2026')
 * dari Date — formatSimpleDate, formatCustomDateRange, formatTaskDate.
 * Anti-poisoning: non-Date / Date rusak → null (pemanggil pakai fallback). */
export function idDateLong(d) {
  if (typeof d?.getTime !== 'function' || Number.isNaN(d.getTime())) return null
  return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()] || ''} ${d.getFullYear()}`
}

/** Siklus 357: satu sumber 'HH:MM' dari Date (formatTaskDate & nama snapshot).
 * Anti-poisoning: non-Date / Date rusak → null (pemanggil pakai fallback). */
export function clockFromDate(d) {
  if (typeof d?.getTime !== 'function' || Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Siklus 355: satu sumber menit-of-day dari Date saat ini (init slider HUD). */
export function dayMinutesNow(d = new Date()) {
  if (typeof d?.getTime !== 'function' || Number.isNaN(d.getTime())) return 0
  return d.getHours() * 60 + d.getMinutes()
}

/** Siklus 355: satu sumber menit-of-day → 'HH:MM' (slider HUD).
 * Anti-poisoning: input non-finite / non-angka → '00:00', bukan 'NaN:NaN'. */
export function clockFromMinutes(min) {
  const n = Number(min)
  if (!Number.isFinite(n) || n < 0) return '00:00'
  const clamped = Math.min(n, 1439)
  const h = Math.floor(clamped / 60), m = Math.floor(clamped % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Siklus 345: satu sumber jam 'HH.MM' id-ID dari Date saat ini.
 * Pengganti salinan `new Date().toLocaleTimeString('id-ID', {hour,minute})`
 * di App.jsx (stempel log aktivitas). Date rusak → null.
 */
export function clockNowShortId(d = new Date()) {
  if (typeof d?.getTime !== 'function' || Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Siklus 343: satu sumber jam 'HH.MM'/'HH.MM.SS' id-ID.
 * Pengganti salinan toLocaleTimeString('id-ID', ...) di komponen
 * (SysMeter updated_at dgn detik, HUD wall clock tanpa detik).
 * Masukan boleh Date/number; null/NaN -> null (pemanggil memutuskan fallback).
 */
export function clockNowId(withSeconds = false) {
  const d = withSeconds ? new Date() : null
  const now = d || new Date()
  const opts = { hour: '2-digit', minute: '2-digit' }
  if (withSeconds) opts.second = '2-digit'
  if (typeof now?.getTime !== 'function' || Number.isNaN(now.getTime())) return null
  return now.toLocaleTimeString('id-ID', opts)
}
