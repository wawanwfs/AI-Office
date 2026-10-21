// @vitest-environment jsdom
// Unit test painter plafon prosedural (parts/ceiling_canvas.js).
// ctx recorder + gradien palsu; memverifikasi urutan & parameter identik kode lama.
import { describe, it, expect } from 'vitest';
import { drawCeiling, CEIL_SIZE, CEIL_TILES, CEIL_CELL } from '../scene/parts/ceiling_canvas.js';

function makeCtx(){
  const ops=[]; let gid=0;
  const grads=[];
  const mk=(kind,args)=>{ const g={kind,args,stops:[],_id:gid++};
    g.addColorStop=(o,c)=>g.stops.push([o,c]);
    grads.push(g); return g; };
  const ctx={
    _ops:ops, _grads:grads,
    createLinearGradient:(...a)=>{ const g=mk('linear',a); ops.push(['createLinearGradient',a,g]); return g; },
    createRadialGradient:(...a)=>{ const g=mk('radial',a); ops.push(['createRadialGradient',a,g]); return g; },
    fillRect:(...a)=>ops.push(['fillRect',a]),
    beginPath:()=>ops.push(['beginPath']),
    moveTo:(...a)=>ops.push(['moveTo',a]),
    lineTo:(...a)=>ops.push(['lineTo',a]),
    stroke:()=>ops.push(['stroke']),
    set fillStyle(v){ ops.push(['fillStyle',v]); },
    set strokeStyle(v){ ops.push(['strokeStyle',v]); },
    set lineWidth(v){ ops.push(['lineWidth',v]); },
  };
  return ctx;
}

const gradOf=(ctx,opName,idx)=>{ const call=ctx._ops.filter(o=>o[0]===opName)[idx]; return call[2]; };

describe('drawCeiling', ()=>{
  it('mengekspor konstanta ukuran', ()=>{
    expect(CEIL_SIZE).toBe(512); expect(CEIL_TILES).toBe(4); expect(CEIL_CELL).toBe(128);
  });

  it('gradien linear vertikal 2 stop #0C1B33 → #0A1628 lalu fillRect penuh', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const g=gradOf(c,'createLinearGradient',0);
    expect(g.kind).toBe('linear');
    expect(g.args).toEqual([0,0,0,512]);
    expect(g.stops).toEqual([[0,'#0C1B33'],[1,'#0A1628']]);
    const ops=c._ops;
    const iFill=ops.findIndex(o=>o[0]==='fillRect');
    expect(ops[iFill][1]).toEqual([0,0,512,512]);
    expect(ops[iFill-1][0]).toBe('fillStyle'); // fillStyle diset sebelum fillRect
  });

  it('vignette radial (256,256,r80→340) 2 stop lalu fillRect penuh', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const g=gradOf(c,'createRadialGradient',0);
    expect(g.kind).toBe('radial');
    expect(g.args).toEqual([256,256,80,256,256,340]);
    expect(g.stops).toEqual([[0,'rgba(20,36,64,0.35)'],[1,'rgba(4,9,18,0.55)']]);
    const rectAfter=c._ops.filter(o=>o[0]==='fillRect')[1];
    expect(rectAfter[1]).toEqual([0,0,512,512]);
  });

  it('seam grid: 10 stroke vertikal+horizontal pada kelipatan 128, lineWidth 2', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const ops=c._ops;
    const iGrid=ops.findIndex(o=>o[0]==='strokeStyle'&&o[1]==='rgba(70,95,140,0.35)');
    expect(iGrid).toBeGreaterThan(-1);
    expect(ops[iGrid+1]).toEqual(['lineWidth',2]);
    // segmen grid: 5 vertikal + 5 horizontal, masing-masing beginPath/moveTo/lineTo/stroke
    const seg=[];
    for(let i=iGrid+2;i<ops.length;i++){
      if(ops[i][0]==='strokeStyle'&&ops[i][1]==='rgba(120,150,200,0.12)') break;
      if(['beginPath','moveTo','lineTo','stroke'].includes(ops[i][0])) seg.push(ops[i]);
    }
    expect(seg.filter(o=>o[0]==='stroke')).toHaveLength(10);
    // pasangan segmen: 5 vertikal [x,0→x,512] + 5 horizontal [0,y→512,y]
    const segs=[]; let cur=null;
    seg.forEach(o=>{
      if(o[0]==='moveTo') cur=[o[1]];
      else if(o[0]==='lineTo'&&cur){ cur.push(o[1]); segs.push(cur); cur=null; }
    });
    expect(segs).toHaveLength(10);
    const verts=segs.filter(s=>s[0][0]===s[1][0]).map(s=>s[0][0]);
    const horiz=segs.filter(s=>s[0][1]===s[1][1]).map(s=>s[0][1]);
    expect(verts.sort((a,b)=>a-b)).toEqual([0,128,256,384,512]);
    expect(horiz.sort((a,b)=>a-b)).toEqual([0,128,256,384,512]);
    // semua garis vertikal sampai bawah, horizontal sampai kanan
    expect(segs.filter(s=>s[0][0]===s[1][0]).every(s=>s[1][1]===512)).toBe(true);
    expect(segs.filter(s=>s[0][1]===s[1][1]).every(s=>s[1][0]===512)).toBe(true);
  });

  it('bevel aksen: 10 stroke offset +2, lineWidth 1, warna rgba(120,150,200,0.12)', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const ops=c._ops;
    const iBev=ops.findIndex(o=>o[0]==='strokeStyle'&&o[1]==='rgba(120,150,200,0.12)');
    expect(iBev).toBeGreaterThan(-1);
    expect(ops[iBev+1]).toEqual(['lineWidth',1]);
    const seg=[];
    for(let i=iBev+2;i<ops.length;i++) if(['moveTo','lineTo','stroke'].includes(ops[i][0])) seg.push(ops[i]);
    expect(seg.filter(o=>o[0]==='stroke')).toHaveLength(10);
    // offset +2 di sisi seam
    const mv=seg.filter(o=>o[0]==='moveTo');
    expect(mv.some(o=>o[1][0]===2&&o[1][1]===0)).toBe(true);   // vertikal +2
    expect(mv.some(o=>o[1][0]===0&&o[1][1]===2)).toBe(true);   // horizontal +2
    expect(mv.some(o=>o[1][0]===514&&o[1][1]===0)).toBe(true); // vertikal terakhir (i=4 → 514)
  });

  it('urutan keseluruhan: gradien → fill → vignette → fill → grid → bevel', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const names=c._ops.map(o=>o[0]);
    expect(names.indexOf('createLinearGradient')).toBe(0);
    const firstRad=names.indexOf('createRadialGradient');
    expect(firstRad).toBeGreaterThan(c._ops.findIndex(o=>o[0]==='fillRect'));
    const iGrid=c._ops.findIndex(o=>o[0]==='strokeStyle'&&o[1]==='rgba(70,95,140,0.35)');
    const iBev=c._ops.findIndex(o=>o[0]==='strokeStyle'&&o[1]==='rgba(120,150,200,0.12)');
    expect(iBev).toBeGreaterThan(iGrid);
    // hanya 2 createGradient & 2 fillRect total
    expect(c._ops.filter(o=>o[0]==='createLinearGradient')).toHaveLength(1);
    expect(c._ops.filter(o=>o[0]==='createRadialGradient')).toHaveLength(1);
    expect(c._ops.filter(o=>o[0]==='fillRect')).toHaveLength(2);
  });

  it('tidak ada oper liar (hanya ops yang dikenal)', ()=>{
    const c=makeCtx(); drawCeiling(c);
    const allowed=new Set(['createLinearGradient','createRadialGradient','fillRect','beginPath','moveTo','lineTo','stroke','fillStyle','strokeStyle','lineWidth']);
    for(const op of c._ops) expect(allowed.has(op[0])).toBe(true);
  });
});
