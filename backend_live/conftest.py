"""Konfigurasi pytest untuk backend_live — modul superset produksi (siklus 208).

`backend/server.py` (repo) mengimpor flat `tasks` / `orders` — persis seperti
produksi gateway :8787 (~/wfs-office/server.py memuat tasks.py & orders.py
sebagai modul flat). Sejak siklus 208 SATU SUMBER file itu adalah
`backend_live/wfs_tasks.py` & `backend_live/wfs_orders.py`, jadi test yang
mengimpor server.py harus melihat alias flat yang sama. Tanpa alias, test akan
jatuh ke salinan lain (atau gagal import) dan drift bisa kembali tanpa ketahuan.

Deploy produksi: `python3 scripts/apply_wfs_tasks.py --apply`.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_BACKEND = HERE.parent / "backend"

for p in (str(HERE), str(REPO_BACKEND)):
    if p not in sys.path:
        sys.path.insert(0, p)

import wfs_tasks  # noqa: E402
import wfs_orders  # noqa: E402

sys.modules.setdefault("tasks", wfs_tasks)
sys.modules.setdefault("orders", wfs_orders)
