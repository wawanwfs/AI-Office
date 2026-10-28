#!/usr/bin/env python3
"""Reverse-BFS dari node berat (JSArrayBufferData/typedarray/Object 'e' dsb):
siapa yang memegang data 31.7 MB ini setelah 2 remount + GC paksa?"""
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
str_idx={}
def sid(s):
    if s not in str_idx:
        try: str_idx[s]=strings.index(s)
        except ValueError: str_idx[s]=-1
    return str_idx[s]

# ── pilih node target: top self_size per kelas menarik ──
def top_nodes(type_name, name_filter=None, k=12):
    m=(t==NTI[type_name])
    if name_filter is not None:
        m&=np.isin(nm,[sid(x) for x in name_filter if sid(x)>=0])
    w=np.where(m)[0]
    order=w[np.argsort(-ss[w])][:k]
    return [(int(o),int(ss[o]),NT[t[o]],strings[nm[o]] if nm[o]<len(strings) else '?') for o in order]

targets=[]
targets+=top_nodes('native',['system / JSArrayBufferData'],15)
targets+=top_nodes('native',['ArrayBuffer','Float32Array','Uint16Array','WebGLBuffer','WebGLVertexArrayObject','WebGLUniformLocation'],10)
targets+=top_nodes('object',['e','ga','X','Y','ia','di','nl'],8)
targets+=top_nodes('native',['blink::HeapHashTableBacking<blink::HashTable<std::pair<blink::St'],4)
# dedup
seen=set(); T=[]
for o,sz,tn,nn in targets:
    if o not in seen: seen.add(o); T.append((o,sz,tn,nn))
print(f"target nodes: {len(T)}", flush=True)

def desc(o):
    return f"{NT[t[o]]}:{(strings[nm[o]] if nm[o]<len(strings) else '?')[:40]}({ss[o]}B)"

# ── reverse BFS ≤5 level dari semua target ──
visited=set(o for o,_,_,_ in T)
parents={}
frontier=set(visited)
level=0
while frontier and level<5:
    fmask=np.isin(to_ord,np.array(sorted(frontier),dtype=np.int64))
    eidx=np.where(fmask)[0]
    new=[]
    for e in eidx:
        p=int(src[e]); to=int(to_ord[e])
        if p not in visited:
            visited.add(p); parents[p]=(int(e),to); new.append(p)
    cnt=collections.Counter()
    for p in new:
        cnt[desc(p)]+=1
    print(f"\n== level {level+1}: {len(new)} retainer ==", flush=True)
    for d,c in cnt.most_common(14):
        print(f"  x{c:6d}  {d}", flush=True)
    frontier=set(new); level+=1

# ── jalur utk 6 target terbesar ──
print("\n===== JALUR (top target) =====", flush=True)
children={}
for p,(e,to) in parents.items():
    children.setdefault(to,[]).append((p,e))
def path_to_root(o, depth=7):
    out=[]
    cur=o
    for _ in range(depth):
        ch=children.get(cur)
        if not ch: break
        p,e=max(ch,key=lambda x:ss[x[0]])
        et=ET[edges[e,E_T]] if edges[e,E_T]<len(ET) else '?'
        en=edges[e,E_N]
        ename=(strings[en] if isinstance(en,int) and en<len(strings) else en)
        out.append(f"--[{et}:{str(ename)[:26]}]--> {desc(p)}")
        cur=p
    return out
for o,sz,tn,nn in T[:8]:
    print(f"\nTARGET {tn}:{nn[:40]} ({sz}B)")
    for step in path_to_root(o):
        print("   "+step, flush=True)
