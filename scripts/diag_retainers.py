#!/usr/bin/env python3
"""Forensik retainer cepat (numpy): siapa memegang Scene/AudioContext mati?

Format .heapsnapshot: nodes & edges = array FLAT int. to_node pada edge =
FIELD-OFFSET ke array nodes flat (divalidasi). Source tiap edge implisit:
edge milik node berurutan sesuai edge_count tiap node. BFS mundur ≤6 level
dari target (Scene/AudioContext), tampilkan retainer per level + jalur akar.
"""
import numpy as np, json, os, sys, collections

PATH = os.path.expanduser("~/.hermes/cache/scratch/hs.heapsnapshot")
raw = open(PATH, "rb").read()
print(f"file: {len(raw)/1048576:.0f} MB", flush=True)


def scan_balanced(raw, start, open_b, close_b):
    """Return index PERTAMA close_b pada depth-0 mulai start (depth-aware, sadar string)."""
    depth = 0; i = start; n = len(raw); instr = False; esc = False
    while i < n:
        c = raw[i]
        if instr:
            if esc: esc = False
            elif c == 0x5C: esc = True
            elif c == 0x22: instr = False
        else:
            if c == 0x22: instr = True
            elif c == open_b: depth += 1
            elif c == close_b:
                depth -= 1
                if depth == 0: return i
        i += 1
    raise ValueError("unbalanced")


def region(key):
    i = raw.index(key) + len(key)
    j = scan_balanced(raw, i, 0x5B, 0x5D)  # [
    return raw[i:j + 1]  # SERTAKAN bracket buka/tutup


# ── meta & strings ──
i = raw.index(b'"meta":') + len(b'"meta":')
j = scan_balanced(raw, i, 0x7B, 0x7D)  # {
meta = json.loads(raw[i:j + 1].decode())
NF = meta["node_fields"]; EF = meta["edge_fields"]
NT = (meta["node_types"] or [[]])[0]; ET = (meta["edge_types"] or [[]])[0]
W = len(NF); EW = len(EF)
I_TYPE, I_NAME, I_SELF, I_EDGES = NF.index("type"), NF.index("name"), NF.index("self_size"), NF.index("edge_count")
E_TYPE, E_NAME, E_TO = EF.index("type"), EF.index("name_or_index"), EF.index("to_node")
print("NF:", NF, "| EF:", EF, flush=True)

strings = json.loads(region(b'"strings":').decode())
print(f"strings: {len(strings)}", flush=True)

# ── nodes & edges (C-speed) ──
def nums(key):
    r = region(key)
    return np.fromstring(r[1:-1], dtype=np.int64, sep=",")

nodes = nums(b'"nodes":').reshape(-1, W)
edges = nums(b'"edges":').reshape(-1, EW)
n_nodes, n_edges = len(nodes), len(edges)
print(f"nodes: {n_nodes}, edges: {n_edges}", flush=True)
assert (edges[:, E_TO] % W == 0).all(), "to_node bukan kelipatan W — asumsi field-offset salah!"
to_ord = edges[:, E_TO] // W
assert to_ord.max() < n_nodes, "to_node keluar jangkauan"

ntype = nodes[:, I_TYPE]; nname = nodes[:, I_NAME]; nself = nodes[:, I_SELF]
ecnt = nodes[:, I_EDGES]
assert ecnt.sum() == n_edges, f"edge_count sum {ecnt.sum()} != {n_edges}"
src = np.repeat(np.arange(n_nodes, dtype=np.int64), ecnt)  # ordinal sumber per edge


def desc(o):
    t = NT[ntype[o]] if ntype[o] < len(NT) else "?"
    nm = strings[nname[o]] if 0 <= nname[o] < len(strings) else "?"
    return f"{t}:{str(nm)[:48]}({nself[o]}B)"


# ── target: Scene & AudioContext ──
tmask = np.isin(ntype, [NT.index("object") if "object" in NT else -1, NT.index("native") if "native" in NT else -1])
tnames = np.array([strings[k] if k < len(strings) else "" for k in range(0)])  # placeholder
# nama node bisa jutaan — hindari list comprehension penuh: pakai mapping via dict string-index
want_name_idx = collections.defaultdict(list)
# bangun hanya untuk beberapa nama: cari index string dulu
name_to_idx = {}
for si, s in enumerate(strings):
    if s in ("Scene", "AudioContext") and s not in name_to_idx:
        name_to_idx[s] = si
        if len(name_to_idx) == 2:
            break
targets = np.where(tmask & np.isin(nname, list(name_to_idx.values())))[0]
print("targets:", [(o, desc(o)) for o in targets], flush=True)

# ── BFS mundur ≤6 level ──
frontier = set(int(o) for o in targets)
parents = {}   # node_ord -> (edge_idx, parent_ord)
level = 0
visited = set(frontier)
while frontier and level < 6:
    fmask = np.isin(to_ord, np.array(sorted(frontier), dtype=np.int64))
    eidx = np.where(fmask)[0]
    ps = src[eidx]
    new = []
    for e, p in zip(eidx, ps):
        p = int(p); to = int(to_ord[e])
        if p not in visited:
            visited.add(p); parents[p] = (int(e), to); new.append(p)
    print(f"\n== level {level+1}: {len(new)} retainer baru ==", flush=True)
    cnt = collections.Counter(desc(p) for p in new)
    for d, c in cnt.most_common(12):
        print(f"  x{c:5d}  {d}", flush=True)
    frontier = set(new)
    level += 1

# ── jalur dari tiap target ke akar ──
print("\n===== JALUR =====", flush=True)
for t in targets:
    t = int(t)
    print(f"\n--- target {desc(t)} ---")
    # cari satu jalur: ambil parent berantai hingga tak ada parent
    cur = t
    path = []
    for _ in range(8):
        pr = None
        for p, (e, to) in parents.items():
            if to == cur:
                pr = (p, e); break
        if not pr:
            break
        p, e = pr
        et = ET[edges[e, E_TYPE]] if edges[e, E_TYPE] < len(ET) else "?"
        en = strings[edges[e, E_NAME]] if 0 <= edges[e, E_NAME] < len(strings) else edges[e, E_NAME]
        path.append(f"--[{et}:{str(en)[:28]}]--> {desc(p)}")
        cur = p
    print("  Scene/AudioCtx " + "\n    ".join(path) if path else "  (tak ketemu jalur)")

# ── ukur graph mati: subtree forward dari Scene target yang TIDAK jadi scene aktif ──
print("\n== ukur subtree mati ==", flush=True)
# anak (forward edges) = edge dengan src=o
def subtree_size(root_ord, cap=150000):
    seen = {root_ord}; stack = [root_ord]; total = 0
    # forward edge index per src: edges terurut per src (implisit) — buatCSR
    offs = np.zeros(n_nodes + 1, dtype=np.int64)
    np.cumsum(ecnt, out=offs[1:])
    while stack:
        o = stack.pop()
        total += int(nself[o])
        s, e0 = offs[o], offs[o + 1]
        for e in range(s, e0):
            ch = int(to_ord[e])
            if ch not in seen:
                seen.add(ch); stack.append(ch)
                if len(seen) > cap:
                    return total, len(seen), True
    return total, len(seen), False

for t in targets:
    tot, nseen, capped = subtree_size(int(t))
    print(f"{desc(t)}: subtree {tot/1048576:.1f} MB, {nseen} node{' (CAP)' if capped else ''}", flush=True)
