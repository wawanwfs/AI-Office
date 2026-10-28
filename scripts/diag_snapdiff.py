#!/usr/bin/env python3
"""Diff hs_a (2 remount) vs hs_b (6 remount): kelas dengan count/size naik ~3x
= kelas bocor. Urutkan by pertumbuhan size absolut."""
import numpy as np, json, os, gc, collections, sys

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

def region(raw,key):
    i=raw.index(key)+len(key); j=scan_balanced(raw,i,0x5B,0x5D); return raw[i:j+1]

def parse(path):
    raw=open(path,'rb').read()
    i=raw.index(b'"meta":')+7
    meta=json.loads(raw[i:scan_balanced(raw,i,0x7B,0x7D)+1].decode())
    NF=meta['node_fields']; NT=(meta['node_types'] or [[]])[0]
    W=len(NF); I_T,I_N,I_S=NF.index('type'),NF.index('name'),NF.index('self_size')
    strings=json.loads(region(raw,b'"strings":').decode())
    r=region(raw,b'"nodes":')
    nodes=np.fromstring(r[1:-1],dtype=np.int64,sep=',').reshape(-1,W)
    del raw, r; gc.collect()
    t=nodes[:,I_T]; nm=nodes[:,I_N]; ss=nodes[:,I_S]
    agg=collections.Counter(); cnt=collections.Counter()
    # vectorized grouping: unique (type,name) pairs
    tn=np.stack([t,nm],axis=1)
    unq,inv=np.unique(tn,axis=0,return_inverse=True)
    su=np.bincount(inv,weights=ss)
    cn=np.bincount(inv)
    for jx in range(len(unq)):
        tt=NT[unq[jx,0]] if unq[jx,0]<len(NT) else '?'
        nn=strings[unq[jx,1]] if unq[jx,1]<len(strings) else '?'
        agg[(tt,nn)]=int(su[jx]); cnt[(tt,nn)]=int(cn[jx])
    del nodes,tn,unq,inv; gc.collect()
    return agg,cnt

A=parse(os.path.expanduser("~/.hermes/cache/scratch/hs_a.heapsnapshot"))
print("A parsed", flush=True)
B=parse(os.path.expanduser("~/.hermes/cache/scratch/hs_b.heapsnapshot"))
print("B parsed", flush=True)

ta,ca=A; tb,cb=B
rows=[]
for k in set(tb)|set(ta):
    sa=ta.get(k,0); sb=tb.get(k,0)
    d=sb-sa
    if d>200000 and sa>0:
        rows.append((d, sa/1048576, sb/1048576, k, ca.get(k,0), cb.get(k,0)))
rows.sort(reverse=True)
print("\n=== TOP 30 PERTUMBUHAN (B vs A, expected x3) ===")
for d,sa,sb,k,na,nb in rows[:30]:
    ratio=f"x{sb/sa:.2f}" if sa>0.01 else "new"
    print(f"+{d/1048576:8.2f} MB  {sa:8.2f}->{sb:8.2f} MB {ratio:7s} n {na:7d}->{nb:8d}  {k[0]:9s} {str(k[1])[:48]}")
tot_a=sum(ta.values())/1048576; tot_b=sum(tb.values())/1048576
print(f"\ntotal self_size: A {tot_a:.1f} MB -> B {tot_b:.1f} MB (Δ{tot_b-tot_a:.1f})")
