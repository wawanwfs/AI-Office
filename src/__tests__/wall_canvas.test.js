// @vitest-environment jsdom
// Unit test painter tekstur dinding — parts/wall_canvas.js.
// ctx recorder + gradien palsu; memverifikasi urutan & parameter identik fungsi tex() inline lama di OfficeScene.
import { describe, it, expect } from 'vitest';
import { drawWallTex, WALL_TEX_TOP, WALL_TEX_BOTTOM } from '../scene/parts/wall_canvas.js';

function makeCtx() {
  const ops = []; const grads = [];
  const mk = (kind, args) => { const g = { kind, args, stops: [] };
    g.addColorStop = (o, c) => g.stops.push([o, c]);
    grads.push(g); return g; };
  const ctx = {
    _ops: ops, _grads: grads,
    createLinearGradient: (...a) => { const g = mk('linear', a); ops.push(['createLinearGradient', a, g]); return g; },
    fillRect: (...a) => ops.push(['fillRect', a]),
    beginPath: (...a) => ops.push(['beginPath', a]),
    moveTo: (...a) => ops.push(['moveTo', a]),
    lineTo: (...a) => ops.push(['lineTo', a]),
    stroke: (...a) => ops.push(['stroke', a]),
    set fillStyle(v) { ops.push(['fillStyle', v]); },
    set strokeStyle(v) { ops.push(['strokeStyle', v]); },
    set lineWidth(v) { ops.push(['lineWidth', v]); },
  };
  return ctx;
}

describe('drawWallTex', () => {
  it('mengekspor warna gradien atas & bawah sesuai kode lama', () => {
    expect(WALL_TEX_TOP).toBe('rgba(255,255,255,.12)');
    expect(WALL_TEX_BOTTOM).toBe('rgba(0,0,0,.08)');
  });

  it('parameter default 512×256 step 64', () => {
    const c = makeCtx();
    drawWallTex(c, '#E6EAF1', 'rgba(130,145,170,.30)');
    // fillRect pertama pakai default
    const rects = c._ops.filter(o => o[0] === 'fillRect');
    expect(rects[0][1]).toEqual([0, 0, 512, 256]);
  });

  it('latar penuh + fillStyle base sebagai oper pertama', () => {
    const c = makeCtx();
    drawWallTex(c, '#8A6244', 'rgba(40,25,10,.40)');
    expect(c._ops[0]).toEqual(['fillStyle', '#8A6244']);
    expect(c._ops[1]).toEqual(['fillRect', [0, 0, 512, 256]]);
  });

  it('garis nat vertikal: strokeStyle/lineWidth 3, satu path per garis 0..wpx langkah step; lalu seam horizontal 1.5', () => {
    const c = makeCtx();
    drawWallTex(c, '#E6EAF1', 'rgba(130,145,170,.30)');
    expect(c._ops[2]).toEqual(['strokeStyle', 'rgba(130,145,170,.30)']);
    expect(c._ops[3]).toEqual(['lineWidth', 3]);
    // garis vertikal di x=0,64,...,512 → 9 garis (i<=wpx)
    const mov = c._ops.map((o, i) => (o[0] === 'moveTo' ? o[1] : null)).filter(Boolean);
    const vert = mov.slice(0, 9).map(([x]) => x);
    expect(vert).toEqual([0, 64, 128, 192, 256, 320, 384, 448, 512]);
    // tiap garis vertikal: moveTo(i,0) lalu lineTo(i,hpx)
    for (let i = 4; i < c._ops.length - 1; i++) {
      if (c._ops[i][0] === 'moveTo' && c._ops[i][1][1] === 0) {
        expect(c._ops[i + 1][0]).toBe('lineTo');
        expect(c._ops[i + 1][1]).toEqual([c._ops[i][1][0], 256]);
      }
    }
    // seam horizontal: lineWidth turun ke 1.5, 3 garis (j=64,128,192) moveTo(0,j)→lineTo(wpx,j)
    const lw15 = c._ops.findIndex(o => o[0] === 'lineWidth' && o[1] === 1.5);
    expect(lw15).toBeGreaterThan(0);
    const seams = mov.slice(9, 12);
    expect(seams.map(([, y]) => y)).toEqual([64, 128, 192]);
  });

  it('step kustom 32 (dinding kayu) menghasilkan 17 garis vertikal + 3 seam horizontal = 20 stroke', () => {
    const c = makeCtx();
    drawWallTex(c, '#8A6244', 'rgba(40,25,10,.40)', 512, 256, 32);
    const strokes = c._ops.filter(o => o[0] === 'stroke').length;
    expect(strokes).toBe(20);
  });

  it('empat gradien: satin, AO kiri, AO kanan, gradien vertikal akhir dgn 2 stop kode lama', () => {
    const c = makeCtx();
    drawWallTex(c, '#E6EAF1', 'rgba(130,145,170,.30)', 256, 128, 64);
    expect(c._grads.length).toBe(4);
    const [satin, aoL, aoR, g] = c._grads;
    expect(satin.args).toEqual([0, 0, 256, 0]);
    expect(aoL.args).toEqual([0, 0, 46, 0]);
    expect(aoR.args).toEqual([256, 0, 210, 0]);
    expect(g.kind).toBe('linear');
    expect(g.args).toEqual([0, 0, 0, 128]);
    expect(g.stops).toEqual([
      [0, 'rgba(255,255,255,.12)'],
      [1, 'rgba(0,0,0,.08)'],
    ]);
    const lastRect = c._ops.filter(o => o[0] === 'fillRect').pop();
    expect(lastRect[1]).toEqual([0, 0, 256, 128]);
  });

  it('urutan keseluruhan: base fill → nat stroke → seam → satin → AO kiri/kanan → gradien akhir', () => {
    const c = makeCtx();
    drawWallTex(c, '#E6EAF1', 'rgba(130,145,170,.30)');
    const kinds = c._ops.map(o => o[0]);
    expect(kinds[0]).toBe('fillStyle');
    expect(kinds[1]).toBe('fillRect');
    expect(kinds[2]).toBe('strokeStyle');
    expect(kinds[3]).toBe('lineWidth');
    // blok nat: 9× (beginPath, moveTo, lineTo, stroke)
    const natBlock = kinds.slice(4, 4 + 36);
    expect(natBlock.join(',')).toBe('beginPath,moveTo,lineTo,stroke,'.repeat(9).replace(/,$/, '').split(',').join(','));
    // blok seam horizontal: lineWidth + 3× (beginPath, moveTo, lineTo, stroke) = 13 op
    expect(kinds.slice(40, 41)).toEqual(['lineWidth']);
    expect(kinds.slice(41, 53).join(',')).toBe('beginPath,moveTo,lineTo,stroke,'.repeat(3).replace(/,$/, '').split(',').join(','));
    // kemudian 4× (createLinearGradient, fillStyle, fillRect): satin, AO-L, AO-R, final
    expect(kinds.slice(53)).toEqual(
      ['createLinearGradient', 'fillStyle', 'fillRect',
       'createLinearGradient', 'fillStyle', 'fillRect',
       'createLinearGradient', 'fillStyle', 'fillRect',
       'createLinearGradient', 'fillStyle', 'fillRect']
    );
    expect(c._ops.filter(o => o[0] === 'createLinearGradient').length).toBe(4);
  });

  it('dua pemanggilan tidak berbagi state gradien', () => {
    const a = makeCtx(); const b = makeCtx();
    drawWallTex(a, '#E6EAF1', 'rgba(130,145,170,.30)');
    drawWallTex(b, '#8A6244', 'rgba(40,25,10,.40)', 512, 256, 32);
    expect(a._grads.length).toBe(4);
    expect(b._grads.length).toBe(4);
    expect(a._grads[0]).not.toBe(b._grads[0]);
    expect(b._grads[3].stops[0][1]).toBe('rgba(255,255,255,.12)');
  });
});
