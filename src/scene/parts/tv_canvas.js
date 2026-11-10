// Canvas TV lounge: render dasbor WFS HQ LIVE diekstrak murni dari drawTv
// (OfficeScene.js) agar bisa di-unit-test: ctx 2D di-inject (mock recorder),
// tidak ada THREE.
import { parseTimestampMs, resolveNow } from '../../lib/kanban_date.js'
import { fmtStampId } from '../../lib/format_time.js'
import { TASK_STATUS_COLORS } from '../../lib/task_status_colors.js'
import { AMBER_ACCENT } from '../../lib/ui_palette.js'

// Warna palet & koordinat layout (satu sumber kebenaran untuk render & test).
export const TV_W = 256;
export const TV_H = 144;
export const TV_BG = '#0A1628';
const TV_ACCENT = AMBER_ACCENT;
export const TV_MUTED = '#8fa3bd';
export const TV_GREEN = '#10E5A0';
// Siklus 381 — TV_BLUE/TV_RED delegasi palet kanonik (dulu salinan drift
// #448AFF/#ef4444). TV_GREEN sudah sama dgn done, tapi tetap eksplisit
// karena dipakai sebagai aksen brand TV, bukan status task.
export const TV_BLUE = TASK_STATUS_COLORS.review;
export const TV_RED = TASK_STATUS_COLORS.failed;
const TV_DIM = '#5b6b82';

// Berapa baris status (GAGAL/REVIEW) yang tampil, dan X untuk kolom kedua.
export function statusRows(T){
  const rows=[];
  if(T.failed)rows.push({color:TV_RED,x:12,text:'GAGAL: '+T.failed});
  if(T.review)rows.push({color:TV_BLUE,x:T.failed?90:12,text:'REVIEW: '+T.review});
  return rows;
}

// Badge koneksi gateway di TV (paritas chip HUD .conn-chip & strip papan 3D).
// state tracker ('live'/'stale'/'down'/kosong) → titik warna + label Indonesia.
// Murni: tanpa canvas — diuji unit. Warna sama dgn strip papan:
// ok=#10E5A0, warn=#F59E0B (amber), err=TV_RED.
import { durLabel } from '../../lib/duration_label.js';
export function tvConnBadge(state,ageSec){
  if(state==='live')return{color:TV_GREEN,label:'LIVE'};
  if(state==='stale'){
    // durLabel satu sumber (siklus 374); TV pakai gaya KAPITAL tanpa "lalu".
    const ago=(durLabel(ageSec)||'0 dtk lalu').replace(/ lalu$/,'');
    return{color:AMBER_ACCENT,label:'SINKRON '+ago.toUpperCase()+' LALU'};
  }
  return{color:TV_RED,label:'TERPUTUS'};
}

// Persen progres total task (0 bila total/done non-finite atau total 0 — hindari
// NaN/Infinity merambat ke lebar bar & teks; konsisten dgn pola anti-poisoning
// modul lain: clock_canvas/uptime/converse_timing dll).
import { pctDone } from '../../lib/math_util.js';
export function tvPct(T){
  return pctDone(T?.done, T?.total);
}

// Gambar seluruh dasbor TV pada ctx (2D canvas). Semua pengambilan teks
// di-pure-kan lewat helper di atas; fungsi ini hanya urutan perintah gambar.
// opts.conn: {state,ageSec} opsional — bila ada, badge koneksi gateway
// digambar di sudut kanan atas (paritas chip HUD & strip papan 3D).
// Siklus 269 — stempel "update" ANTI-POISONING: data.at diparsing via
// parseTimestampMs (null/NaN/±Inf/string invalid/Date NaN → NULL, bukan NaN
// lolos), fallback ke opts.now (juga diparsing — dulu `opts.now||Date.now()`
// membuat NaN TRUTHY lolos) lalu Date.now(). `new Date('invalid')` lama
// melukis "update Invalid Date" permanen di TV 3D kelas "Sinkron NaN" 268.
export function drawTvDashboard(ctx,data,opts={}){
  const now = resolveNow(opts.now);
  const stampTs = parseTimestampMs(data?.at) ?? now;
  ctx.fillStyle=TV_BG;ctx.fillRect(0,0,TV_W,TV_H);
  ctx.fillStyle=TV_ACCENT;ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillText('WFS HQ · LIVE',12,24);
  const cb=opts.conn?tvConnBadge(opts.conn.state,opts.conn.ageSec):null;
  if(cb){ // titik + label singkat di sudut kanan atas, tak menabrak header kiri
    ctx.fillStyle=cb.color;ctx.beginPath();ctx.arc(TV_W-14,18,3.5,0,Math.PI*2);ctx.fill();
    ctx.font='bold 9px monospace';ctx.textAlign='right';
    ctx.fillText(cb.label,TV_W-22,21);
    ctx.textAlign='left';
  }
  const T=data?.tasks,S=data?.saas,AG=data?.agents||[];
  if(!T){ // belum ada data / fetch gagal
    ctx.fillStyle=TV_MUTED;ctx.font='12px monospace';
    ctx.fillText('menghubungkan...',12,70);
    return;
  }
  const pct=tvPct(T);
  // progress bar
  ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(12,36,232,12);
  const grd=ctx.createLinearGradient(12,0,244,0);grd.addColorStop(0,TV_GREEN);grd.addColorStop(1,TV_BLUE);
  ctx.fillStyle=grd;ctx.fillRect(12,36,Math.max(6,232*pct/100),12);
  ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';
  ctx.fillText(pct+'% · '+T.done+'/'+T.total+' task',12,62);
  ctx.font='11px monospace';
  for(const r of statusRows(T)){ctx.fillStyle=r.color;ctx.fillText(r.text,r.x,80);}
  // SaaS
  ctx.fillStyle=TV_BLUE;ctx.fillText('SaaS',12,100);
  ctx.fillStyle=S&&S.online?TV_GREEN:TV_RED;
  ctx.fillText(S&&S.online?((S.stats?.tenants||0)+' tenant · '+(S.stats?.messages||0)+' pesan'):'offline',48,100);
  // agents
  ctx.fillStyle=TV_BLUE;ctx.fillText('AGENT',12,120);
  ctx.fillStyle=TV_GREEN;
  ctx.fillText(AG.map(a=>a.name+(a.status==='Up'?'●':'○')).join(' ')||'-',56,120);
  ctx.fillStyle=TV_DIM;ctx.font='9px monospace';
  ctx.fillText('update '+(fmtStampId(stampTs) ?? ''),12,138);
}
