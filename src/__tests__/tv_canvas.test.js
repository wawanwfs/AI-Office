import {describe,it,expect} from 'vitest';
import {
  TV_W,TV_H,TV_BG,TV_MUTED,TV_GREEN,TV_BLUE,TV_RED,
  statusRows,tvPct,tvConnBadge,drawTvDashboard
} from '../scene/parts/tv_canvas.js';

// Mock ctx 2D: merekam perintah fillText/fillRect + warna aktif.
function mockCtx(){
  const ops=[];let color=null;
  const grd={addColorStop(){}};
  const c={
    get fillStyle(){return color},set fillStyle(v){color=v;ops.push({op:'style',v})},
    font:'',textAlign:'',textBaseline:'',
    createLinearGradient(){return grd},
    beginPath(){},arc(){},fill(){},
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
  it('non-finite total/done → 0 (hindari NaN/Infinity merambat ke bar & teks)',()=>{
    expect(tvPct({total:10,done:NaN})).toBe(0);
    expect(tvPct({total:10,done:Infinity})).toBe(0);
    expect(tvPct({total:Infinity,done:5})).toBe(0);
    expect(tvPct({total:10})).toBe(0);          // done undefined
    expect(tvPct({total:undefined,done:5})).toBe(0);
    expect(tvPct({total:null,done:5})).toBe(0);
    expect(tvPct(null)).toBe(0);
    expect(tvPct(undefined)).toBe(0);
    expect(tvPct({})).toBe(0);
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

describe('tvConnBadge — badge koneksi gateway TV (paritas chip HUD & strip papan 3D)',()=>{
  it('live → titik hijau + label LIVE',()=>{
    expect(tvConnBadge('live')).toEqual({color:TV_GREEN,label:'LIVE'});
  });
  it('stale → amber + umur data (<60 dtk dalam detik, ≥60 dtk dalam menit)',()=>{
    expect(tvConnBadge('stale',45).color).toBe('#F59E0B');
    expect(tvConnBadge('stale',45).label).toBe('SINKRON 45 dtk LALU');
    expect(tvConnBadge('stale',125).label).toBe('SINKRON 2 mnt LALU');
  });
  it('down / state tak dikenal / tracker kosong → merah TERPUTUS',()=>{
    expect(tvConnBadge('down')).toEqual({color:TV_RED,label:'TERPUTUS'});
    expect(tvConnBadge(undefined)).toEqual({color:TV_RED,label:'TERPUTUS'});
    expect(tvConnBadge('weird',10)).toEqual({color:TV_RED,label:'TERPUTUS'});
  });
  it('umur negatif di-clamp ke 0 (jam mesin mundur tidak menghasilkan label aneh)',()=>{
    expect(tvConnBadge('stale',-5).label).toBe('SINKRON 0 dtk LALU');
  });
  it('render: opts.conn live → titik hijau kanan atas + label LIVE; tanpa opts.conn → tidak digambar',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:1,done:1},saas:{online:true,stats:{}},agents:[]},{now:0,conn:{state:'live',ageSec:3}});
    const dot=c.__ops.find(o=>o.op==='text'&&o.t==='LIVE');
    expect(dot).toBeTruthy();
    expect(dot.color).toBe(TV_GREEN);
    expect(dot.x).toBe(TV_W-22); // kanan atas, tidak menabrak header kiri
    expect(dot.y).toBe(21);
    const c2=mockCtx();
    drawTvDashboard(c2,{tasks:{total:1,done:1},saas:{online:true,stats:{}},agents:[]},{now:0});
    expect(texts(c2).some(o=>o.t==='LIVE'||o.t.startsWith('SINKRON')||o.t==='TERPUTUS')).toBe(false);
  });
  it('render: stale → label amber dgn umur; down → merah TERPUTUS; tetap menggambar dasbor di bawahnya',()=>{
    const c=mockCtx();
    drawTvDashboard(c,{tasks:{total:10,done:3},saas:{online:false},agents:[]},{now:0,conn:{state:'stale',ageSec:75}});
    expect(find(c,'SINKRON 1 mnt LALU').color).toBe('#F59E0B');
    expect(find(c,'30% · 3/10 task')).toBeTruthy(); // dasbor tetap tergambar
    const c3=mockCtx();
    drawTvDashboard(c3,{tasks:{total:4,done:1,failed:2,review:1},saas:{online:true,stats:{}},agents:[]},{now:0,conn:{state:'down',ageSec:0}});
    expect(find(c3,'TERPUTUS').color).toBe(TV_RED);
    expect(find(c3,'GAGAL: 2')).toBeTruthy(); // baris status tetap ada
  });
  it('render: badge digambar juga saat belum ada data (menghubungkan)',()=>{
    const c=mockCtx();
    drawTvDashboard(c,null,{now:0,conn:{state:'down'}});
    expect(find(c,'TERPUTUS')).toBeTruthy();
    expect(find(c,'menghubungkan...').color).toBe(TV_MUTED);
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
