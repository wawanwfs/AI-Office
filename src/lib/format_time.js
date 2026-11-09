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
