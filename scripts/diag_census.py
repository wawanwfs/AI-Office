#!/usr/bin/env python3
"""Census node menarik di heap snapshot: canvas/2D ctx/WebGL/ImageData/detached
DOM + blink hash tables — apakah count naik ~2x per remount (sisa scene lama)?"""
import numpy as np, json, os, collections

PATH = os.path.expanduser("~/.hermes/cache/scratch/hs.heapsnapshot")
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
NF=meta['node_fields']; NT=(meta['node_types'] or [[]])[0]
W=len(NF); I_T,I_N,I_S,I_D=NF.index('type'),NF.index('name'),NF.index('self_size'),NF.index('detachedness')
strings=json.loads(region(b'"strings":').decode())

def nums(key):
    r=region(key); return np.fromstring(r[1:-1],dtype=np.int64,sep=',')
nodes=nums(b'"nodes":').reshape(-1,W)
print(f"nodes: {len(nodes)}", flush=True)

t=nodes[:,I_T]; nm=nodes[:,I_N]; ss=nodes[:,I_S]; det=nodes[:,I_D]
name_counts=collections.Counter()
name_size=collections.Counter()
# build name -> occurrences via unique names of 'native' & 'object' nodes
WANT = {"HTMLCanvasElement","OffscreenCanvas","CanvasRenderingContext2D","WebGLRenderingContext",
        "WebGL2RenderingContext","ImageData","ImageBitmap","HTMLDivElement","HTMLSpanElement",
        "Text","AudioBuffer","AudioBufferSourceNode","GainNode","BiquadFilterNode","OscillatorNode",
        "ArrayBuffer","Float32Array","Uint16Array","Uint32Array","Int32Array","Uint8Array","Uint8ClampedArray",
        "ResizeObserver","MutationObserver","IntersectionObserver","WebSocket","EventSource",
        "PerformanceObserver","MessageChannel","MessagePort","Worker","AudioContext","OfflineAudioContext"}
# index string
idx_of={}
for si,s in enumerate(strings):
    if s in WANT and s not in idx_of: idx_of[s]=si
for s,si in idx_of.items():
    w=np.where(nm==si)[0]
    if len(w):
        tys=collections.Counter(NT[x] for x in t[w])
        name_counts[s]=len(w); name_size[s]=int(ss[w].sum())
        print(f"{s:26s} n={len(w):7d} size={ss[w].sum()/1048576:8.2f} MB types={dict(tys)} detached={(det[w]>0).sum()}", flush=True)

# native nodes top names
ntv=(t==NT.index('native'))
un,inv,cn=np.unique(nm[ntv],return_inverse=True,return_counts=True)
su=np.bincount(inv,weights=ss[ntv])
order=np.argsort(-su)[:18]
print("\n--- native top 18 ---")
for k in order:
    print(f"{su[k]/1048576:9.2f} MB x{cn[k]:7d}  {strings[un[k]][:64]}", flush=True)

# detached objects
dt=(det>0)&(t==NT.index('object'))
print(f"\nobject detached: {dt.sum()} ({ss[dt].sum()/1048576:.1f} MB)")
un,inv,cn=np.unique(nm[dt],return_inverse=True,return_counts=True)
su=np.bincount(inv,weights=ss[dt])
order=np.argsort(-su)[:15]
for k in order:
    print(f"  {su[k]/1048576:8.2f} MB x{cn[k]:6d}  {strings[un[k]][:50]}", flush=True)
