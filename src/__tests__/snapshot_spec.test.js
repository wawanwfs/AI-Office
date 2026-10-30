import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotDataUrl, snapshotFilename, triggerSnapshotDownload, MIN_SNAPSHOT_CHARS, SNAPSHOT_MIME } from '../scene/parts/snapshot_spec.js';

// Siklus 178 — FOTO: snapshot PNG kanvas 3D (tombol QuickToolbar).
// Kontrak inti: kanvas WebGL TANPA preserveDrawingBuffer menghapus buffer gambar
// setelah tiap presentasi → toDataURL di luar tugas render = PNG KOSONG.
// renderFn WAJIB dipanggil PERSIS sebelum toDataURL (urutan = inti kontrak).
// Hasil di bawah ambang MIN_SNAPSHOT_CHARS = buffer kosong TERDETEKSI (ok:false),
// bukan file rusak diunduh diam-diam. Semua fungsi murni / terinjeksi doc.

const __dir = join(dirname(fileURLToPath(import.meta.url)));
const __root = join(__dir, '../..'); // repo root (src/__tests__/.. = src, lalu ..)
const readSrc = (p) => readFileSync(join(__root, p), 'utf8');

// Stub kanvas 2D — toDataURL menghasilkan dataURL dgn panjang terkontrol.
function makeCanvas({ w = 1366, h = 768, urlLen = 900000, mime = SNAPSHOT_MIME, throwOnUrl = false } = {}) {
  return {
    width: w, height: h,
    getContext: () => ({}),
    toDataURL: () => {
      if (throwOnUrl) throw new Error('SecurityError: toDataURL diblokir (canvas tainted)');
      return 'data:' + mime + ';base64,' + 'A'.repeat(urlLen);
    },
  };
}

describe('snapshotDataUrl — kontrak anti-buffer-kosong', () => {
  it('memanggil renderFn PERSIS SEBELUM toDataURL (urutan = inti kontrak)', () => {
    const calls = [];
    const canvas = makeCanvas();
    canvas.toDataURL = () => { calls.push('toDataURL'); return 'data:image/png;base64,' + 'A'.repeat(900000); };
    snapshotDataUrl(canvas, () => calls.push('render'));
    expect(calls).toEqual(['render', 'toDataURL']);
  });

  it('tanpa renderFn tetap jalan (callback opsional)', () => {
    const r = snapshotDataUrl(makeCanvas());
    expect(r.ok).toBe(true);
  });

  it('hasil OK membawa dataUrl + bytes + filename persis apa adanya', () => {
    const r = snapshotDataUrl(makeCanvas({ urlLen: 123456 }), undefined, 'kantor-wfs-2026-10-30_1830.png');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBe(r.dataUrl.length); // bytes = ukuran dataUrl persis (metadata jujur)
    expect(r.filename).toBe('kantor-wfs-2026-10-30_1830.png');
    expect(r.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('PNG kosong (di bawah ambang) → ok:false error png-kosong — TIDAK diunduh diam-diam', () => {
    const r = snapshotDataUrl(makeCanvas({ urlLen: 100 })); // header + 100 char < ambang
    expect(r.ok).toBe(false);
    expect(r.error).toBe('png-kosong');
  });

  it('ambang MIN_SNAPSHOT_CHARS eksak: tepat di atas lolos, di bawah gagal', () => {
    const over = MIN_SNAPSHOT_CHARS + 1; // payload melewati header 'data:image/png;base64,' + padding
    const under = 100; // jelas di bawah
    expect(snapshotDataUrl(makeCanvas({ urlLen: over })).ok).toBe(true);
    expect(snapshotDataUrl(makeCanvas({ urlLen: under })).ok).toBe(false);
  });

  it('mime bukan image/png (canvas dibajak jpeg) → ok:false mime-tak-didukung', () => {
    const r = snapshotDataUrl(makeCanvas({ mime: 'image/jpeg', urlLen: 900000 }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('mime-tak-didukung');
  });

  it('canvas hilang / null / bukan kanvas → ok:false canvas-tidak-ada (anti-poisoning)', () => {
    expect(snapshotDataUrl(null).error).toBe('canvas-tidak-ada');
    expect(snapshotDataUrl(undefined).error).toBe('canvas-tidak-ada');
    expect(snapshotDataUrl({}).error).toBe('canvas-tidak-ada');
    expect(snapshotDataUrl({ width: 10, height: 10 }).error).toBe('canvas-tidak-ada');
  });

  it('ukuran kanvas 0 → ok:false ukuran-canvas-tak-valid', () => {
    expect(snapshotDataUrl(makeCanvas({ w: 0 })).error).toBe('ukuran-canvas-tak-valid');
    expect(snapshotDataUrl(makeCanvas({ h: 0 })).error).toBe('ukuran-canvas-tak-valid');
  });

  it('toDataURL melempar (canvas tainted) → ok:false dgn pesan error, TIDAK melempar', () => {
    const r = snapshotDataUrl(makeCanvas({ throwOnUrl: true }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SecurityError');
  });
});

describe('snapshotFilename — murni & deterministik (tanpa ICU)', () => {
  it('format kantor-wfs-YYYY-MM-DD_HHMM.png dgn zero-pad eksak', () => {
    expect(snapshotFilename(new Date(2026, 9, 30, 18, 3))).toBe('kantor-wfs-2026-10-30_1803.png');
    expect(snapshotFilename(new Date(2026, 0, 5, 7, 42))).toBe('kantor-wfs-2026-01-05_0742.png');
  });

  it('input bukan Date / Invalid Date → fallback netral (tanpa crash)', () => {
    expect(snapshotFilename(null)).toBe('kantor-wfs.png');
    expect(snapshotFilename(undefined)).toBe('kantor-wfs.png');
    expect(snapshotFilename(new Date(NaN))).toBe('kantor-wfs.png');
    expect(snapshotFilename('2026-10-30')).toBe('kantor-wfs.png');
  });
});

describe('triggerSnapshotDownload — <a download> + pembuangan anchor', () => {
  it('membuat anchor dgn href dataUrl + download filename, klik, lalu DIBUANG dari DOM', () => {
    const doc = {
      createElement: vi.fn(() => {
        const a = { href: '', download: '', clicked: false };
        a.click = () => { a.clicked = true; };
        return a;
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    };
    const name = triggerSnapshotDownload(
      { dataUrl: 'data:image/png;base64,AAAA', filename: 'kantor-wfs.png' },
      doc,
    );
    expect(name).toBe('kantor-wfs.png');
    expect(doc.createElement).toHaveBeenCalledTimes(1);
    const a = doc.createElement.mock.results[0].value;
    expect(a.href).toBe('data:image/png;base64,AAAA');
    expect(a.download).toBe('kantor-wfs.png');
    expect(a.clicked).toBe(true);
    // PEMBUANGAN anchor: append & remove pasangan eksak (DOM bersih, tanpa bocor)
    expect(doc.body.appendChild).toHaveBeenCalledTimes(1);
    expect(doc.body.removeChild).toHaveBeenCalledTimes(1);
    expect(doc.body.removeChild.mock.calls[0][0]).toBe(a);
  });

  it('input tak valid → null TANPA menyentuh DOM', () => {
    const doc = { createElement: vi.fn(), body: { appendChild: vi.fn(), removeChild: vi.fn() } };
    expect(triggerSnapshotDownload(undefined, doc)).toBe(null);
    expect(triggerSnapshotDownload({ dataUrl: 'javascript:alert(1)', filename: 'x.png' }, doc)).toBe(null);
    expect(triggerSnapshotDownload({ dataUrl: null, filename: 'x.png' }, doc)).toBe(null);
    expect(doc.createElement).not.toHaveBeenCalled();
    expect(doc.body.appendChild).not.toHaveBeenCalled();
  });
});

// ── Kontrak statis wiring (pola input_edges 176 / orbit 177) ──────────────────
describe('wiring statis — scene & UI terpasang pada kontrak', () => {
  const scene = readSrc('src/scene/OfficeScene.js');

  it('OfficeScene: takeSnapshot delegasi snapshotDataUrl dgn render sinkron renderer.render(scene,camera)', () => {
    expect(scene).toMatch(/takeSnapshot:\s*\(\)\s*=>\s*snapshotDataUrl\(/);
    expect(scene).toMatch(/snapshotDataUrl\(renderer\s*\?\s*renderer\.domElement\s*:\s*null/);
    // Render sinkron di dalam renderFn — bukan menunggu rAF
    expect(scene).toMatch(/renderer\.render\(scene,\s*camera\)/);
    expect(scene).toMatch(/snapshotFilename\(new Date\(\)\)/);
  });

  it('OfficeScene: probe __takeSnapshot terpasang di window (hook e2e, metadata saja)', () => {
    expect(scene).toMatch(/window\.__takeSnapshot\s*=/);
  });

  it('scene_hooks: __takeSnapshot terdaftar (purge destroy — anti bocor hook)', () => {
    const hooks = readSrc('src/scene/parts/scene_hooks.js');
    expect(hooks).toMatch(/'__takeSnapshot'/);
  });

  it('QuickToolbar: tombol FOTO — prop onSnapshot opsional, IconCamera, aria-label', () => {
    const ui = readSrc('src/components/QuickToolbar.jsx');
    expect(ui).toMatch(/onSnapshot && \(/);
    expect(ui).toMatch(/IconCamera/);
    expect(ui).toMatch(/aria-label="Simpan foto kantor"/);
  });

  it('App: delegasi onSnapshot → takeSnapshot + flash gagal bila tak valid + unduh bila OK', () => {
    const app = readSrc('src/App.jsx');
    expect(app).toMatch(/onSnapshot=\{/,);
    expect(app).toMatch(/takeSnapshot\(\)/);
    expect(app).toMatch(/triggerSnapshotDownload\(r\)/);
    expect(app).toMatch(/Foto gagal: /);
  });
});
