#!/usr/bin/env python3
import shutil, os, urllib.request

src_dist = '/home/agentuser/ai-office-main/dist'
dst_hq = '/home/agentuser/wfs-hq'

# Salin aset baru
for item in os.listdir(src_dist):
    s = os.path.join(src_dist, item)
    d = os.path.join(dst_hq, item)
    if os.path.isdir(s):
        if os.path.exists(d):
            shutil.rmtree(d)
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)

# Test koneksi
try:
    with urllib.request.urlopen('http://127.0.0.1:9503/', timeout=3) as r:
        print(f"deployed, 9503: {r.status}")
except Exception as e:
    print(f"deployed (service restart needed): {e}")
