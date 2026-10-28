#!/usr/bin/env python3
"""Jalur retainer PENUH: dari objek berat (JSArrayBufferData/Canvas2D/Object 'e')
naik sampai AKAR GC (node sintetis '(GC roots)'/'(Bootstrapper)'/'global'),
dengan edge name per langkah → nama properti/variabel penyebab bocor."""
import numpy as np, json, os, collections, sys

PATH = os.path.expanduser("~/.hermes/cache/scratch/hs_b.heapsnapshot")
raw = open(PATH, "rb").read()

def scan_balanced(raw, start, ob, cb):
    d=0;i=start;n=len(raw);ins=False;esc=False
    while i<n:
        c=raw[i]
        if ins:
            if esc: esc=False
            elif c==0x5C: esc=True
            elif c==0x22: ins=False
        else:
            if c==0x22: ins=True
            elif c==ob: d+=1
            elif c==cb:
                d-=1
                if d==0: return i
        i+=1
    raise ValueError

def region(key):
    i=raw.index(key)+len(key); j=scan_balanced(raw,i,0x5B,0x5D); return raw[i:j+1]

i=raw.index(b'"meta":')+7
meta=json.loads(raw[i:scan_balanced(raw,i,0x7B,0x7D)+1].decode())
NF=meta['node_fields']; EF=meta['edge_fields']
NT=(meta['node_types'] or [[]])[0]; ET=(meta['edge_types'] or [[]])[0]
W=len(NF); EW=len(EF)
I_T,I_N,I_S,I_E=NF.index('type'),NF.index('name'),NF.index('self_size'),NF.index('edge_count')
E_T,E_N,E_TO=EF.index('type'),EF.index('name_or_index'),EF.index('to_node')
strings=json.loads(region(b'"strings":').decode())

def nums(key):
    r=region(key); return np.fromstring(r[1:-1],dtype=np.int64,sep=',')
nodes=nums(b'"nodes":').reshape(-1,W)
edges=nums(b'"edges":').reshape(-1,EW)
n_nodes,n_edges=len(nodes),len(edges)
print(f"nodes {n_nodes}, edges {n_edges}", flush=True)

to_ord=edges[:,E_TO]//W
ecnt=nodes[:,I_E]
offs=np.zeros(n_nodes+1,dtype=np.int64); np.cumsum(ecnt,out=offs[1:])
src=np.repeat(np.arange(n_nodes,dtype=np.int64),ecnt)
t=nodes[:,I_T]; nm=nodes[:,I_N]; ss=nodes[:,I_S]
NTI={s:i for i,s in enumerate(NT)}

def sname(k): return strings[k] if 0<=k<len(strings) else '?'
def desc(o):
    return f"[{o}] {NT[t[o]]}:{sname(nm[o])[:52]}({ss[o]}B)"

# pilih target: canvas ctx terbesar + objek 'e'
targets=[]
for typ,names,k in (('native',['CanvasRenderingContext2D'],2),
                    ('object',['e'],1)):
    m=(t==NTI[typ])
    idxs=[strings.index(x) for x in names if x in strings]
    m&=np.isin(nm,idxs)
    w=np.where(m)[0]
    w=w[np.argsort(-ss[w])][:k]
    targets+= [int(o) for o in w]
print("targets:", [desc(o) for o in targets], flush=True)

# reverse BFS per-target sampai ketemu akar (sintetis / global / window)
ROOTISH = {'(GC roots)','(Bootstrapper)','(Client heap)','global object','(Global handles)',
           '(External strings)','(Detached Domains)','(Array buffer)'}
MAXL=45
for tgt in targets[:1]:
    print(f"\n########## TARGET {desc(tgt)}", flush=True)
    parents={tgt:None}
    frontier=[tgt]
    found=None
    for lvl in range(MAXL):
        nxt=[]
        fmask=np.isin(to_ord,np.array(frontier,dtype=np.int64))
        eidx=np.where(fmask)[0]
        eidx=eidx[edges[eidx,E_T]!=ET.index('weak')]  # weak TIDAK menahan — eksklusi
        for e in eidx:
            p=int(src[e])
            if p in parents: continue
            parents[p]=(int(e),int(to_ord[e]))
            nxt.append(p)
            pn=sname(nm[p])
            if (NT[t[p]]=='synthetic') or pn in ROOTISH or (NT[t[p]]=='object' and pn in ('window','global')):
                found=p
                print(f"  level {lvl+1}: AKAR {desc(found)}", flush=True)
        if found is not None:
            break
        print(f"  level {lvl+1}: frontier {len(nxt)}", flush=True)
        if not nxt: break
        frontier=nxt
    if found is None:
        # root terdekat: node dengan orang tua sintetis/global terdekat
        cand=[]
        for p,v in parents.items():
            if v is None: continue
            e,to=v
            if NT[t[p]]=='synthetic' or sname(nm[p]) in ROOTISH:
                cand.append((p,(e,to)))
        if cand:
            found=cand[0][0]
            print(f"AKAR (cand): {desc(found)}", flush=True)
        else:
            print(f"tak ketemu akar ≤{MAXL}; frontier {len(frontier)}; deepest samples:")
            for p in frontier[:6]: print("   ", desc(p), flush=True)
            continue
    # cetak jalur
    cur=found; steps=[]
    while parents[cur] is not None:
        e,to=parents[cur]
        et=ET[edges[e,E_T]] if edges[e,E_T]<len(ET) else '?'
        en=edges[e,E_N]
        ename=sname(en) if isinstance(en,(int,np.integer)) else en
        steps.append(f"←({et}:{str(ename)[:34]})— {desc(cur)}")
        cur=to
    steps.append(f"←— {desc(tgt)} (TARGET)")
    print("JALUR:")
    for s in steps: print("  "+s, flush=True)
sys.exit(0)
