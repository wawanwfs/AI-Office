# CI audit execution modes

WFS AI Office menguji source frontend dan backend dengan workflow CI pada setiap push dan pull request.

## Portable CI (default)

```sh
npm ci
npm test
npm run build
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Pengujian kontrak file/script tetap berjalan. Enam pemeriksaan *live-only* sengaja
`skip` dalam runner biasa karena memerlukan layanan terpasang, database host,
Docker, atau source repository saudara yang tidak ikut dalam checkout. Ini
bukan bukti bahwa audit operasional lulus.

## Audit live pada host yang memang dikonfigurasi

Lakukan di host yang memiliki izin dan akses sah ke target; script menguji
port, konfigurasi dan data host yang berjalan. Audit ini **tidak** boleh dipicu
secara tidak sengaja oleh workflow pada runner publik.

Linux/macOS:

```sh
WFS_RUN_LIVE_AUDITS=1 npm test
```

Windows PowerShell:

```powershell
$env:WFS_RUN_LIVE_AUDITS = '1'
npm test
Remove-Item Env:WFS_RUN_LIVE_AUDITS
```

Audit aktif meliputi: HEAD vs GET di beberapa gateway, eksposur OmniRoute,
datastore SaaS, autentikasi JWT SaaS, dan pemeriksaan database UI. Beberapa
script saat ini merujuk path absolut milik lingkungan deployment sebelumnya.
Sesuaikan target dan kelengkapan layanan terlebih dahulu, **jangan** mengganti
kegagalan live menjadi hasil sukses buatan.

## Batas audit kode

Perbaikan ini mengisolasi 6 pemeriksaan infrastruktur yang tidak portable.
Belum membuktikan keamanan layanan produksi, performa 3D di semua perangkat,
atau hasil uji end-to-end terhadap Docker dan model AI nyata.
