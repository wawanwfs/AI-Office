#!/bin/sh
# Entrypoint wfs-office-gw — TANPA patch server.py produksi.
# Paritas systemd: python server.py (uvicorn.run(app, 0.0.0.0, 8787)).
# Container: WFS_PORT override port (rehearsal :8788) + WFS_HERMES_HOME mengganti
# HOME supaya pathlib.Path.home()/.hermes/.env (default AI) ditemukan via bind mount.
set -e
if [ -n "$WFS_HERMES_HOME" ]; then
  export HOME="$WFS_HERMES_HOME"
fi
exec python -c "import os,uvicorn,server; uvicorn.run(server.app, host='0.0.0.0', port=int(os.environ.get('WFS_PORT','8787')))"
