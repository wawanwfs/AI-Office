#!/usr/bin/env python3
"""Parse .heapsnapshot → agregasi count & self_size per tipe/kelas node (top-25)
+ hitungan khusus objek scene (Scene/Mesh/Geometry/Texture/Renderer/Audio*)."""
import ijson, collections, sys, json

PATH = "/home/agentuser/.hermes/cache/scratch/hs.heapsnapshot"

strings = []
with open(PATH, "rb") as f:
    for s in ijson.items(f, "strings.item"):
        strings.append(s)
print(f"strings: {len(strings)}", flush=True)

node_fields = None
node_types0 = None
with open(PATH, "rb") as f:
    meta = ijson.items(f, "snapshot.meta")
    for m in meta:
        node_fields = m.get("node_fields")
        node_types0 = (m.get("node_types") or [[]])[0]
        break
print("node_fields:", node_fields, flush=True)
print("node_types0:", node_types0[:12], flush=True)

FLDS = {n: i for i, n in enumerate(node_fields)}
I_TYPE, I_NAME, I_SIZE = FLDS["type"], FLDS["name"], FLDS["self_size"]
W = len(node_fields)

agg = collections.Counter()      # (type,name) -> total self_size
cnt = collections.Counter()      # (type,name) -> count
n_nodes = 0
with open(PATH, "rb") as f:
    for nums in ijson.items(f, "nodes.item"):
        t = node_types0[nums[I_TYPE]] if isinstance(node_types0[nums[I_TYPE]], str) else str(node_types0[nums[I_TYPE]])
        name = strings[nums[I_NAME]] if nums[I_NAME] < len(strings) else "?"
        agg[(t, name)] += nums[I_SIZE]
        cnt[(t, name)] += 1
        n_nodes += 1
print(f"nodes: {n_nodes}", flush=True)

total = sum(agg.values())
print(f"total self_size: {total/1048576:.1f} MB\n--- TOP 25 by self_size ---")
for (t, name), sz in agg.most_common(25):
    print(f"{sz/1048576:9.2f} MB  x{cnt[(t,name)]:7d}  {t:12s} {name[:60]}")

print("\n--- khusus scene ---")
want = ("Scene", "Mesh", "WebGLRenderer", "AudioContext", "AudioBufferSourceNode",
        "Group", "PerspectiveCamera", "WebGLRenderingContext", "OffscreenCanvas")
for w in want:
    tot = sum(sz for (t, name), sz in agg.items() if name == w)
    c = sum(cnt[(t, name)] for (t, name) in cnt if name == w)
    if c:
        print(f"{tot/1048576:9.2f} MB  x{c:6d}  {w}")
typed = [(name, sz, cnt[(t, name)]) for (t, name), sz in agg.items() if t in ("typedarray",)]
typed.sort(key=lambda x: -x[1])
print("--- typedarray top 10 ---")
for name, sz, c in typed[:10]:
    print(f"{sz/1048576:9.2f} MB  x{c:6d}  {name[:60]}")
