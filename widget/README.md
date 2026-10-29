## Widget Chat — embed ke website toko

Tambahkan sebelum `</body>` di website toko:

```html
<iframe id="dbt-widget" src="http://<SERVER>:3001/" 
  style="border:0;position:fixed;bottom:0;right:0;width:360px;height:520px;z-index:9999" 
  allow="clipboard-write"></iframe>
```

Atau serve langsung: container `widget` di port 3001 (sudah termasuk di docker-compose).

Konfigurasi: edit `index.html`, ubah `TENANT_ID` dan `API` (default `http://localhost:8000/api/admin`).
