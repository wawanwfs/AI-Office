// Snapshot (foto PNG) kanvas 3D — siklus 178.
//
// (Latar) Jalur ekspor visual TIDAK pernah ada: satu-satunya cara mendapat
// gambar kantor = screenshot browser (user selama ini mengirim foto layar HP
// utk menilai visual). Tombol FOTO di QuickToolbar kini mengunduh PNG isi
// kanvas 3D langsung dari aplikasi — bersih tanpa chrome browser, resolusi
// device-pixel penuh.
//
// Jebakan WebGL yang menentukan kontrak modul ini: renderer dibuat TANPA
// `preserveDrawingBuffer:true` (hemat memori — pola default three) → buffer
// gambar DIHAPUS setelah tiap presentasi; `canvas.toDataURL()` yang dipanggil
// di luar tugas render menghasilkan PNG KOSONG (kanvas transparan/hitam).
// Solusi standar: render ulang SINKRON (langsung, bukan menunggu rAF berikut)
// sesaat sebelum toDataURL — buffer terisi & dibaca dalam tugas yang sama.
// Render ekstra ini tidak memengaruhi loop animate (state scene tak disentuh)
// dan tidak mengubah kamera (theta/phi/radius/goal utuh — diuji e2e).
//
// Kontrak murni (pola orbit_spec/zoom_spec — diuji unit tanpa scene):
// - snapshotDataUrl(canvas, renderFn) → {ok:true,dataUrl,bytes,filename} atau
//   {ok:false,error}. Input TIDAK dimutasi. renderFn (opsional) dipanggil
//   PERSIS SEBELUM toDataURL (urutan = inti kontrak anti-buffer-kosong).
// - Validasi hasil: mime harus image/png + payload ≥ MIN_SNAPSHOT_CHARS
//   (PNG kanvas hitam 1366×768 ≈ 3-8 KB; render kantor nyata ratusan KB —
//   hasil di bawah ambang = buffer kosong terdeteksi, BUKAN file rusak
//   diunduh diam-diam).
// - Anti-poisoning: canvas hilang/bukan kanvas, ukuran 0, toDataURL melempar
//   → {ok:false,error} terstruktur (UI menampilkan flash gagal, bukan crash).
// - snapshotFilename(date) murni & deterministik (tanpa ketergantungan ICU —
//   pola perfChip): 'kantor-wfs-YYYY-MM-DD_HHMM.png', zero-pad eksak.
// - triggerSnapshotDownload({dataUrl,filename}, doc) memakai <a download>
//   (klik sintetis; anchor dibuang) — App.jsx tinggal delegasi, test jsdom
//   memverifikasi href/download/click/PEMBUANGAN anchor.

export const MIN_SNAPSHOT_CHARS = 30000; // ≈22 KB biner — ambang "render nyata"
export const SNAPSHOT_MIME = 'image/png';

const isCanvas = (c) => !!c && typeof HTMLCanvasElement !== 'undefined'
  ? c instanceof HTMLCanvasElement
  : !!(c && typeof c.getContext === 'function' && typeof c.toDataURL === 'function');

/**
 * Ambil PNG kanvas 3D. renderFn dipanggil sinkron sesaat sebelum pembacaan
 * buffer (kontrak anti-buffer-kosong — renderer produksi tanpa
 * preserveDrawingBuffer).
 * @param {HTMLCanvasElement} canvas  domElement renderer
 * @param {()=>void} [renderFn]       render sinkron (renderer.render(scene,camera))
 * @returns {{ok:true,dataUrl:string,bytes:number,filename:string}|{ok:false,error:string}}
 */
export function snapshotDataUrl(canvas, renderFn, filename = '') {
  if (!isCanvas(canvas)) return { ok: false, error: 'canvas-tidak-ada' };
  if (!(canvas.width > 0) || !(canvas.height > 0)) return { ok: false, error: 'ukuran-canvas-tak-valid' };
  try {
    if (typeof renderFn === 'function') renderFn(); // WAJIB sebelum toDataURL
    const dataUrl = canvas.toDataURL(SNAPSHOT_MIME);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:' + SNAPSHOT_MIME)) {
      return { ok: false, error: 'mime-tak-didukung' };
    }
    if (dataUrl.length < MIN_SNAPSHOT_CHARS) {
      return { ok: false, error: 'png-kosong' }; // buffer dihapus — render ulang gagal
    }
    return { ok: true, dataUrl, bytes: dataUrl.length, filename };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? String(e.message).slice(0, 120) : 'snapshot-gagal' };
  }
}

const p2 = (n) => (n < 10 ? '0' + n : String(n));

/**
 * Nama file foto: kantor-wfs-YYYY-MM-DD_HHMM.png (murni, deterministik —
 * tanpa toLocaleString/ICU). Non-Date / waktu tak valid → fallback netral.
 */
export function snapshotFilename(date) {
  const ok = date instanceof Date && Number.isFinite(date.getTime());
  if (!ok) return 'kantor-wfs.png';
  return 'kantor-wfs-' + date.getFullYear() + '-' + p2(date.getMonth() + 1) + '-' + p2(date.getDate())
    + '_' + p2(date.getHours()) + p2(date.getMinutes()) + '.png';
}

/**
 * Unduh hasil snapshot via <a download> (pola HTML5 standar; tanpa server).
 * doc disuntikkan (testability jsdom); default document. Mengembalikan nama
 * file yang diunduh, atau null bila input tak valid.
 */
export function triggerSnapshotDownload({ dataUrl, filename } = {}, doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:' + SNAPSHOT_MIME)) return null;
  const a = d.createElement('a');
  a.href = dataUrl;
  a.download = typeof filename === 'string' && filename ? filename : 'kantor-wfs.png';
  d.body.appendChild(a);
  a.click();
  d.body.removeChild(a);
  return a.download;
}
