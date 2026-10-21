import {describe,it,expect} from 'vitest';
import {
  TV_W,TV_H,TV_BG,TV_MUTED,TV_GREEN,TV_BLUE,TV_RED,
  statusRows,tvPct,drawTvDashboard
} from '../scene/parts/tv_canvas.js';

// Mock ctx 2D: merekam perintah fillText/fillRect + warna aktif.
function mockCtx(){
  const ops=[];let color=null;
  const grd={addColorStop(){}};
  const c={
    get fillStyle(){return color},set fillStyle(v){color=v;ops.push({op:'style',v})},
    font:'',textAlign:'',textBaseline:'',
    createLinearGradient(){return grd},
    fillRect:(x,y,w,h)=>ops.push({op:'rect',color,x,y,w,h}),
    fillText:(t,x,y)=>ops.push({op:'text',color,t,x,y}),
    __ops:ops
  };
  return c;
}
const texts=(c)=>c.__ops.filter(o=>o.op==='text');
const find=(c,t)=>texts(c).find(o=>o.t===t);

describe('tvPct',()=>{
  it('menghitung persen task',()=>{
    expect(tvPct({total:10,done:3})).toBe(30);
    expect(tvPct({total:0,done:5})).toBe(0); // hindari NaN
  });
});

describe('statusRows',()=>{
  it('kosong tanpa failed/review',()=>{
    expect(statusRows({failed:0,review:0})).toEqual([]);
  });
  it('kolom kedua x=90 hanya bila failed tampil',()=>{
    expect(statusRows({failed:2,review:1})[1].x).toBe(90);
    expect(statusRows({failed:0,review:1})[0].x).toBe(12);
    expect(statusRows({failed:2,review:1})[0].color).toBe(TV_RED);
    expect(statusRows({failed:0,review:1})[0].color).toBe(TV_BLUE);
  });
});

describe('drawTvDashboard',()=>{
  it('ukuran kanvas & latar benar',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{}, {now:0});
    const bg=c.__ops.find(o=>o.op==='rect');
    expect(bg).toMatchObject({x:0,y:0,w:TV_W,h:TV_H,color:TV_BG});
  });
  it('belum ada data → teks menghubungkan warna muted',()=>{
    const c=mockCtx();
    drawTvDashboard(c,null,{now:0});
    expect(find(c,'menghubungkan...').color).toBe(TV_MUTED);
    expect(texts(c).length).toBe(2); // judul + connecting saja
  });
  it('task penuh: progres bar, teks persen, bar hijau→biru',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:10,done:10,failed:0,review:0},saas:{online:true,stats:{tenants:2,messages:5}},agents:[]},{now:0});
    expect(find(c,'100% · 10/10 task')).toBeTruthy();
    const rects=c.__ops.filter(o=>o.op==='rect');
    const bar=rects.find(o=>o.w===Math.max(6,232)); // bar penuh
    expect(bar).toBeTruthy();
    expect(find(c,'2 tenant · 5 pesan')).toBeTruthy();
  });
  it('progres 30% → lebar bar 232*30/100',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:10,done:3},saas:{online:false},agents:[]},{now:0});
    const bar=c.__ops.filter(o=>o.op==='rect').find(o=>o.w===69.6);
    expect(bar).toBeTruthy();
    expect(find(c,'offline').color).toBe(TV_RED);
  });
  it('ambang min bar 6px saat pct>0 tapi kecil',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:1000,done:1},saas:{online:false},agents:[]},{now:0});
    expect(c.__ops.filter(o=>o.op==='rect').some(o=>o.w===6)).toBe(true);
  });
  it('baris GAGAL/REVIEW dengan warna & posisi kolom',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:4,done:1,failed:2,review:1},saas:{online:true,stats:{}},agents:[]},{now:0});
    expect(find(c,'GAGAL: 2').color).toBe(TV_RED);
    expect(find(c,'REVIEW: 1').color).toBe(TV_BLUE);
    expect(find(c,'REVIEW: 1').x).toBe(90);
  });
  it('agents: nama + titik status, atau strip bila kosong',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:1,done:1},saas:{online:true,stats:{}},agents:[{name:'be1',status:'Up'},{name:'qa1',status:'Down'}]},{now:0});
    expect(find(c,'be1● qa1○')).toBeTruthy();
    const c2=mockCtx();
    drawTvDashboard(c2,{tasks:{total:1,done:1},saas:{online:true,stats:{}},agents:[]},{now:0});
    expect(find(c2,'-')).toBeTruthy();
  });
  it('stempel waktu pakai data.at, bukan now',()=>{
    const c=mockCtx();
    const at=new Date('2026-10-21T21:00:00+08:00').getTime();
    drawTvDashboard(c,{at,tasks:{total:1,done:1},saas:{online:true,stats:{}},agents:[]},{now:at+99999});
    const stamp=texts(c).find(o=>o.t.startsWith('update '));
    expect(stamp.t).not.toContain(new Date(at+99999).toLocaleTimeString('id-ID'));
    expect(stamp.t).toBe('update '+new Date(at).toLocaleTimeString('id-ID'));
  });
});
