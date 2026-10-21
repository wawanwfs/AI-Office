// @vitest-environment jsdom
// Unit test painter logo WFS Project (parts/logo_canvas.js) — resepsionis & dinding belakang.
// ctx recorder + gradien palsu; memverifikasi urutan & parameter identik kode inline lama.
import { describe, it, expect } from 'vitest';
import { drawResepsiLogo, drawWallLogo, drawWallTitle } from '../scene/parts/logo_canvas.js';

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
    strokeRect:(...a)=>ops.push(['strokeRect',a]),
    beginPath:()=>ops.push(['beginPath']),
    closePath:()=>ops.push(['closePath']),
    moveTo:(...a)=>ops.push(['moveTo',a]),
    lineTo:(...a)=>ops.push(['lineTo',a]),
    fill:()=>ops.push(['fill']),
    stroke:()=>ops.push(['stroke']),
    fillText:(t,...a)=>ops.push(['fillText',t,a]),
    set fillStyle(v){ ops.push(['fillStyle',v]); },
    set strokeStyle(v){ ops.push(['strokeStyle',v]); },
    set lineWidth(v){ ops.push(['lineWidth',v]); },
    set font(v){ ops.push(['font',v]); },
    set textAlign(v){ ops.push(['textAlign',v]); },
    set textBaseline(v){ ops.push(['textBaseline',v]); },
  };
  return ctx;
}

// Heksagon reguler: 6 titik mulai sudut Math.PI/6, arah +Math.PI/3
function hexPts(cx,cy,r){
  const pts=[];
  for(let i=0;i<6;i++){ const a=Math.PI/6+i*Math.PI/3; pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]); }
  return pts;
}
const r6=(v)=>Math.round(v*1e6)/1e6;

describe('drawResepsiLogo (logo resepsionis 1024×320)', ()=>{
  it('latar navy penuh + bingkai emas lineWidth 8', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const ops=c._ops;
    expect(ops[0]).toEqual(['fillStyle','#0F1B2E']);
    expect(ops[1]).toEqual(['fillRect',[0,0,1024,320]]);
    expect(ops[2]).toEqual(['strokeStyle','#D4AF37']);
    expect(ops[3]).toEqual(['lineWidth',8]);
    const sr=ops.find(o=>o[0]==='strokeRect');
    expect(sr[1]).toEqual([6,6,1012,308]);
  });

  it('gradien hexagon (40,40)→(240,280) stop #FBBF24 → #F97316', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const g=c._grads[0];
    expect(g.kind).toBe('linear');
    expect(g.args).toEqual([40,40,240,280]);
    expect(g.stops).toEqual([[0,'#FBBF24'],[1,'#F97316']]);
  });

  it('dua heksagon: luar r115 gradien, dalam r98 navy', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const ops=c._ops;
    // pasangan beginPath→6 lineTo→closePath masing-masing heksagon
    const bp=ops.map((o,i)=>[o,i]).filter(([o])=>o[0]==='beginPath').map(([,i])=>i);
    expect(bp.length).toBe(2);
    for(const [k,i0] of bp.entries()){
      const pts=[];
      for(let j=i0+1;j<ops.length && ops[j][0]==='lineTo';j++) pts.push(ops[j][1]);
      expect(pts.map(p=>p.map(r6))).toEqual(hexPts(150,160,k===0?115:98).map(p=>p.map(r6)));
      expect(ops[i0+7][0]).toBe('closePath');
    }
    // fill pertama pakai gradien, kedua navy
    const fills=ops.filter(o=>o[0]==='fill');
    expect(fills.length).toBe(2);
    // sebelum fill pertama fillStyle = gradien; sebelum fill kedua = '#0F1B2E'
    const iF1=ops.findIndex(o=>o[0]==='fill');
    const lastStyleBefore=(idx)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]==='fillStyle') return ops[j][1]; };
    expect(lastStyleBefore(iF1)).toBe(c._grads[0]);
    const iF2=ops.findIndex((o,i)=>o[0]==='fill'&&i>iF1);
    expect(lastStyleBefore(iF2)).toBe('#0F1B2E');
  });

  it('huruf W di tengah heksagon: gradien, font 900 130px Arial, center/middle', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const ops=c._ops;
    const iW=ops.findIndex(o=>o[0]==='fillText');
    expect(ops[iW][1]).toBe('W');
    expect(ops[iW][2]).toEqual([150,168]);
    const styleBefore=(idx,key)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    expect(styleBefore(iW,'fillStyle')).toBe(c._grads[0]);
    expect(styleBefore(iW,'font')).toBe('900 130px Arial,sans-serif');
    expect(styleBefore(iW,'textAlign')).toBe('center');
    expect(styleBefore(iW,'textBaseline')).toBe('middle');
  });

  it('teks WFS putih 900 150px & PROJECT emas 800 78px, rata kiri/alphabetic', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const ops=c._ops;
    const texts=ops.filter(o=>o[0]==='fillText').map(o=>[o[1],o[2]]);
    expect(texts).toContainEqual(['WFS',[300,175]]);
    expect(texts).toContainEqual(['PROJECT',[306,265]]);
    const styleBefore=(idx,key)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    const iWfs=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='WFS');
    expect(styleBefore(iWfs,'fillStyle')).toBe('#fff');
    expect(styleBefore(iWfs,'font')).toBe('900 150px Arial,sans-serif');
    expect(styleBefore(iWfs,'textAlign')).toBe('left');
    expect(styleBefore(iWfs,'textBaseline')).toBe('alphabetic');
    const iPr=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='PROJECT');
    expect(styleBefore(iPr,'fillStyle')).toBe('#FBBF24');
    expect(styleBefore(iPr,'font')).toBe('800 78px Arial,sans-serif');
  });

  it('tepat 3 teks, tanpa oper lain', ()=>{
    const c=makeCtx(); drawResepsiLogo(c);
    const allowed=new Set(['fillStyle','strokeStyle','lineWidth','fillRect','strokeRect',
      'createLinearGradient','beginPath','lineTo','closePath','fill','fillText',
      'font','textAlign','textBaseline']);
    for(const o of c._ops) expect(allowed.has(o[0])).toBe(true);
    expect(c._ops.filter(o=>o[0]==='fillText').length).toBe(3);
    expect(c._grads.length).toBe(1);
  });
});

describe('drawWallLogo (logo dinding belakang 2048×640)', ()=>{
  it('latar navy penuh + bingkai emas lineWidth 14', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const ops=c._ops;
    expect(ops[0]).toEqual(['fillStyle','#0F1B2E']);
    expect(ops[1]).toEqual(['fillRect',[0,0,2048,640]]);
    expect(ops[2]).toEqual(['strokeStyle','#D4AF37']);
    expect(ops[3]).toEqual(['lineWidth',14]);
    const sr=ops.find(o=>o[0]==='strokeRect');
    expect(sr[1]).toEqual([12,12,2024,616]);
  });

  it('gradien (100,60)→(460,580) stop #FBBF24 → #F97316', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const g=c._grads[0];
    expect(g.kind).toBe('linear');
    expect(g.args).toEqual([100,60,460,580]);
    expect(g.stops).toEqual([[0,'#FBBF24'],[1,'#F97316']]);
  });

  it('dua heksagon pusat (300,320): luar r230 gradien, dalam r196 navy', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const ops=c._ops;
    const bp=ops.map((o,i)=>[o,i]).filter(([o])=>o[0]==='beginPath').map(([,i])=>i);
    expect(bp.length).toBe(2);
    for(const [k,i0] of bp.entries()){
      const r=k===0?230:196;
      const pts=[];
      for(let j=i0+1;j<ops.length && ops[j][0]==='lineTo';j++) pts.push(ops[j][1]);
      expect(pts.map(p=>p.map(r6))).toEqual(hexPts(300,320,r).map(p=>p.map(r6)));
    }
    const styleBefore=(idx,key='fillStyle')=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    const iF1=ops.findIndex(o=>o[0]==='fill');
    expect(styleBefore(iF1)).toBe(c._grads[0]);
    const iF2=ops.findIndex((o,i)=>o[0]==='fill'&&i>iF1);
    expect(styleBefore(iF2)).toBe('#0F1B2E');
  });

  it('huruf W gradien 900 250px Segoe UI center/middle di (300,335)', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const ops=c._ops;
    const iW=ops.findIndex(o=>o[0]==='fillText');
    expect(ops[iW][1]).toBe('W');
    expect(ops[iW][2]).toEqual([300,335]);
    const styleBefore=(idx,key)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    expect(styleBefore(iW,'fillStyle')).toBe(c._grads[0]);
    expect(styleBefore(iW,'font')).toBe('900 250px "Segoe UI",Arial,sans-serif');
    expect(styleBefore(iW,'textAlign')).toBe('center');
    expect(styleBefore(iW,'textBaseline')).toBe('middle');
  });

  it('WFS putih 310px (610,290), PROJECT emas 170px (616,470), tagline abu 62px (620,570)', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const ops=c._ops;
    const texts=ops.filter(o=>o[0]==='fillText').map(o=>[o[1],o[2]]);
    expect(texts).toContainEqual(['WFS',[610,290]]);
    expect(texts).toContainEqual(['PROJECT',[616,470]]);
    expect(texts).toContainEqual(['SOFTWARE HOUSE  \u00b7  AI TEAM',[620,570]]);
    const styleBefore=(idx,key)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    const iWfs=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='WFS');
    expect(styleBefore(iWfs,'fillStyle')).toBe('#FFFFFF');
    expect(styleBefore(iWfs,'font')).toBe('900 310px "Segoe UI",Arial,sans-serif');
    expect(styleBefore(iWfs,'textAlign')).toBe('left');
    expect(styleBefore(iWfs,'textBaseline')).toBe('alphabetic');
    const iPr=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='PROJECT');
    expect(styleBefore(iPr,'fillStyle')).toBe('#FBBF24');
    expect(styleBefore(iPr,'font')).toBe('800 170px "Segoe UI",Arial,sans-serif');
    const iTag=ops.findIndex(o=>o[0]==='fillText'&&o[1].startsWith('SOFTWARE'));
    expect(styleBefore(iTag,'fillStyle')).toBe('rgba(255,255,255,.75)');
    expect(styleBefore(iTag,'font')).toBe('600 62px "Segoe UI",Arial,sans-serif');
  });

  it('tepat 4 teks, 1 gradien, tanpa oper liar', ()=>{
    const c=makeCtx(); drawWallLogo(c);
    const allowed=new Set(['fillStyle','strokeStyle','lineWidth','fillRect','strokeRect',
      'createLinearGradient','beginPath','lineTo','closePath','fill','fillText',
      'font','textAlign','textBaseline']);
    for(const o of c._ops) expect(allowed.has(o[0])).toBe(true);
    expect(c._ops.filter(o=>o[0]==='fillText').length).toBe(4);
    expect(c._grads.length).toBe(1);
    expect(c._ops.filter(o=>o[0]==='createRadialGradient').length).toBe(0);
  });
});

describe('drawWallTitle (judul dinding 1024×200)', ()=>{
  it('clearRect penuh lalu font 900 130px Segoe UI center/middle', ()=>{
    const c=makeCtx(); c.clearRect=(...a)=>c._ops.push(['clearRect',a]);
    drawWallTitle(c);
    const ops=c._ops;
    expect(ops[0]).toEqual(['clearRect',[0,0,1024,200]]);
    expect(ops[1]).toEqual(['font','900 130px "Segoe UI",Arial,sans-serif']);
    expect(ops[2]).toEqual(['textAlign','center']);
    expect(ops[3]).toEqual(['textBaseline','middle']);
  });

  it('WFS putih di (300,100) lalu PROJECT amber di (730,100)', ()=>{
    const c=makeCtx(); c.clearRect=(...a)=>c._ops.push(['clearRect',a]);
    drawWallTitle(c);
    const ops=c._ops;
    const styleBefore=(idx,key)=>{ for(let j=idx-1;j>=0;j--) if(ops[j][0]===key) return ops[j][1]; };
    const iW=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='WFS');
    expect(ops[iW][2]).toEqual([300,100]);
    expect(styleBefore(iW,'fillStyle')).toBe('#FFFFFF');
    const iP=ops.findIndex(o=>o[0]==='fillText'&&o[1]==='PROJECT');
    expect(ops[iP][2]).toEqual([730,100]);
    expect(styleBefore(iP,'fillStyle')).toBe('#F59E0B');
  });

  it('tepat 2 teks, tanpa gradien/fillRect/stroke, tanpa oper liar', ()=>{
    const c=makeCtx(); c.clearRect=(...a)=>c._ops.push(['clearRect',a]);
    drawWallTitle(c);
    const allowed=new Set(['clearRect','fillStyle','font','textAlign','textBaseline','fillText']);
    for(const o of c._ops) expect(allowed.has(o[0])).toBe(true);
    expect(c._ops.filter(o=>o[0]==='fillText').length).toBe(2);
    expect(c._grads.length).toBe(0);
  });

  it('dua pemanggilan tak share state (masing-masing clearRect pertama)', ()=>{
    const a=makeCtx(); a.clearRect=(...x)=>a._ops.push(['clearRect',x]);
    const b=makeCtx(); b.clearRect=(...x)=>b._ops.push(['clearRect',x]);
    drawWallTitle(a); drawWallTitle(b);
    expect(a._ops[0][0]).toBe('clearRect');
    expect(b._ops[0][0]).toBe('clearRect');
    expect(a._ops.filter(o=>o[0]==='fillText').length).toBe(2);
  });
});
