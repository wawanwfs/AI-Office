#!/usr/bin/env python3
"""Parse .heapsnapshot → agregasi count & self_size per tipe/kelas node (top-25)
+ hitungan khusus objek scene + typedarray top. Format 'nodes' FLAT: angka
berulang per node_fields — satu pass ijson, tanpa buffering."""
import ijson, collections

PATH = "/home/agentuser/ai-office-main/.hermes-scratch/hs.heapsnapshot"
import os
if not os.path.exists(PATH):
    PATH = os.path.expanduser("~/.hermes/cache/scratch/hs.heapsnapshot")

strings = []
with open(PATH, "rb") as f:
    for s in ijson.items(f, "strings.item"):
        strings.append(s)
print(f"strings: {len(strings)}", flush=True)

node_fields = None
node_types0 = None
with open(PATH, "rb") as f:
    for m in ijson.items(f, "snapshot.meta"):
        node_fields = m.get("node_fields")
        node_types0 = (m.get("node_types") or [[]])[0]
        break
print("node_fields:", node_fields, flush=True)

FLDS = {n: i for i, n in enumerate(node_fields)}
I_TYPE, I_NAME, I_SIZE = FLDS["type"], FLDS["name"], FLDS["self_size"]
W = len(node_fields)
NT = node_types0

agg = collections.Counter()      # (type,name) -> total self_size
cnt = collections.Counter()      # (type,name) -> count
n_nodes = 0
t = nm = None
with open(PATH, "rb") as f:
    pos = 0
    for v in ijson.items(f, "nodes.item"):
        p = pos % W
        if p == I_TYPE:
            t = NT[v] if v < len(NT) else "?"
        elif p == I_NAME:
            nm = strings[v] if v < len(strings) else "?"
        elif p == I_SIZE:
            k = (t, nm)
            agg[k] += v
            cnt[k] += 1
            n_nodes += 1
        pos += 1
print(f"nodes: {n_nodes}", flush=True)

total = sum(agg.values())
print(f"total self_size: {total/1048576:.1f} MB\n--- TOP 25 by self_size ---")
for (tt, name), sz in agg.most_common(25):
    print(f"{sz/1048576:9.2f} MB  x{cnt[(tt,name)]:7d}  {tt:12s} {str(name)[:60]}")

print("\n--- khusus scene ---")
want = ("Scene", "Mesh", "Group", "PerspectiveCamera", "WebGLRenderer",
        "AudioContext", "AudioBufferSourceNode", "WebGLRenderingContext",
        "OffscreenCanvas", "HTMLCanvasElement", "CanvasRenderingContext2D")
for w in want:
    tot = sum(sz for (tt, name), sz in agg.items() if name == w)
    c = sum(cnt[(tt, name)] for (tt, name) in cnt if name == w)
    if c:
        print(f"{tot/1048576:9.2f} MB  x{c:6d}  {w}")
typed = [(name, sz, cnt[(tt, name)]) for (tt, name), sz in agg.items() if tt in ("typedarray",)]
typed.sort(key=lambda x: -x[1])
print("--- typedarray top 12 ---")
for name, sz, c in typed[:12]:
    print(f"{sz/1048576:9.2f} MB  x{c:6d}  {str(name)[:60]}")
