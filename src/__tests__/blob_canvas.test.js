// @vitest-environment jsdom
// Unit test painter bayangan kontak (blob shadow) — parts/blob_canvas.js.
// ctx recorder + gradien palsu; memverifikasi urutan & parameter identik kode inline lama di OfficeScene.
import { describe, it, expect } from 'vitest';
import { drawBlobShadow, BLOB_SIZE, BLOB_CENTER } from '../scene/parts/blob_canvas.js';

function makeCtx(){
  const ops=[]; const grads=[];
  const mk=(kind,args)=>{ const g={kind,args,stops:[]};
    g.addColorStop=(o,c)=>g.stops.push([o,c]);
    grads.push(g); return g; };
  const ctx={
    _ops:ops, _grads:grads,
    createRadialGradient:(...a)=>{ const g=mk('radial',a); ops.push(['createRadialGradient',a,g]); return g; },
    fillRect:(...a)=>ops.push(['fillRect',a]),
    set fillStyle(v){ ops.push(['fillStyle',v]); },
  };
  return ctx;
}

describe('drawBlobShadow', ()=>{
  it('mengekspor konstanta ukuran & pusat', ()=>{
    expect(BLOB_SIZE).toBe(128);
    expect(BLOB_CENTER).toBe(64);
  });

  it('gradien radial tepat sesuai kode lama (pusat 64,64 r4 → 62)', ()=>{
    const c=makeCtx(); drawBlobShadow(c);
    expect(c._grads.length).toBe(1);
    const g=c._grads[0];
    expect(g.kind).toBe('radial');
    expect(g.args).toEqual([64,64,4,64,64,62]);
  });

  it('tepat 3 colorStop dengan warna & offset lama', ()=>{
    const c=makeCtx(); drawBlobShadow(c);
    expect(c._grads[0].stops).toEqual([
      [0,'rgba(10,14,18,0.55)'],
      [0.55,'rgba(10,14,18,0.30)'],
      [1,'rgba(10,14,18,0)'],
    ]);
  });

  it('urutan oper: createRadialGradient → fillStyle(gradient) → fillRect 128×128, tanpa oper liar', ()=>{
    const c=makeCtx(); drawBlobShadow(c);
    const names=c._ops.map(o=>o[0]);
    expect(names).toEqual(['createRadialGradient','fillStyle','fillRect']);
    // fillStyle mengisi gradien yang sama
    const fillOp=c._ops.find(o=>o[0]==='fillStyle');
    expect(fillOp[1]).toBe(c._grads[0]);
    // fillRect penuh kanvas
    expect(c._ops.find(o=>o[0]==='fillRect')[1]).toEqual([0,0,128,128]);
  });

  it('dipanggil dua kali menghasilkan gradien baru per kanvas (tidak share state)', ()=>{
    const a=makeCtx(), b=makeCtx();
    drawBlobShadow(a); drawBlobShadow(b);
    expect(a._grads[0]).not.toBe(b._grads[0]);
    expect(a._grads[0].stops).toEqual(b._grads[0].stops);
  });
});
