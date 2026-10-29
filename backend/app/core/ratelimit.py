"""Rate limiter sederhana in-memory per IP ( sliding window ). Cukup utk 1-instance."""
import time
from collections import defaultdict, deque
from fastapi import HTTPException, Request

_BUCKETS = defaultdict(deque)   # ip -> deque[timestamps]
LIMIT = 20                      # max request
WINDOW = 60                     # detik

def rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    dq = _BUCKETS[ip]
    while dq and dq[0] < now - WINDOW:
        dq.popleft()
    if len(dq) >= LIMIT:
        raise HTTPException(429, "Terlalu banyak permintaan, coba lagi sebentar.")
    dq.append(now)
