"""Siklus 451: Last-Modified + If-Modified-Since di jalur statis 9503.

Klien/proksi tanpa ETag memakai revalidasi HTTP klasik. ETag tetap
menang bila keduanya ada (RFC 7232 precedence).
"""
import email.utils
import os
import sys
import time
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import static_serve  # noqa: E402


class TestHttpDate451(unittest.TestCase):
    def test_http_date_gmt(self):
        s = static_serve.http_date(0)
        self.assertEqual(s, "Thu, 01 Jan 1970 00:00:00 GMT")
        # Round-trip.
        ts = 1760000000.5
        back = email.utils.parsedate_to_datetime(
            static_serve.http_date(ts)).timestamp()
        self.assertEqual(int(back), int(ts))


class TestNotModifiedSince451(unittest.TestCase):
    LM = 1760000000  # detik

    def test_empty_header_false(self):
        self.assertFalse(static_serve.not_modified_since(self.LM, ""))
        self.assertFalse(static_serve.not_modified_since(self.LM, None))

    def test_equal_since_304(self):
        ims = static_serve.http_date(self.LM)
        self.assertTrue(static_serve.not_modified_since(self.LM, ims))

    def test_newer_since_304(self):
        ims = static_serve.http_date(self.LM + 60)
        self.assertTrue(static_serve.not_modified_since(self.LM, ims))

    def test_older_since_200(self):
        ims = static_serve.http_date(self.LM - 60)
        self.assertFalse(static_serve.not_modified_since(self.LM, ims))

    def test_garbage_false(self):
        self.assertFalse(static_serve.not_modified_since(
            self.LM, "bukan-tanggal"))
        self.assertFalse(static_serve.not_modified_since(self.LM, "0"))

    def test_file_mtime_truncated(self):
        # File mtime fraksional: IMS == trunc(mtime) tetap 304.
        self.assertTrue(static_serve.not_modified_since(
            self.LM + 0.9, static_serve.http_date(self.LM + 0.9)))


class _StubH:
    """Stub handler cukup utk _serve_static / _serve_head_static."""
    def __init__(self, path, headers=None):
        import io
        self.path = path
        self.headers = headers or {}
        self._wfs_cc = None
        self.responses = []
        self.wfile = io.BytesIO()

    def _allowed_rel(self):
        return "x"

    def translate_path(self, p):
        return self._file

    def send_response(self, code):
        self.responses.append(("status", code))

    def send_header(self, k, v):
        self.responses.append((k.lower(), v))

    def end_headers(self):
        self.responses.append(("end", True))

    def guess_type(self, p):
        return "application/octet-stream"


class TestStaticIMS451(unittest.TestCase):
    def setUp(self):
        import tempfile
        fd, self.file = tempfile.mkstemp(suffix=".js")
        with os.fdopen(fd, "wb") as f:
            f.write(b"console.log(451);\n" * 10)
        os.utime(self.file, (1760000000.7, 1760000000.7))

    def tearDown(self):
        os.unlink(self.file)

    def _h(self, headers):
        h = _StubH("/assets/x.js", headers)
        h._file = self.file
        return h

    def _code(self, h):
        for k, v in h.responses:
            if k == "status":
                return v
        return None

    def _hdr(self, h, name):
        return [v for k, v in h.responses if k == name]

    def test_get_200_carries_last_modified(self):
        from wfs_hq_server import H as WFSRequestHandler
        h = self._h({})
        self.assertTrue(WFSRequestHandler._serve_static(h))
        self.assertEqual(self._code(h), 200)
        self.assertTrue(self._hdr(h, "last-modified"))
        self.assertTrue(self._hdr(h, "etag"))
        self.assertTrue(self._hdr(h, "content-length"))

    def test_get_ims_match_304(self):
        from wfs_hq_server import H as WFSRequestHandler
        lm = self._h({})  # ambil LM dari respons 200
        WFSRequestHandler._serve_static(lm)
        lm_val = self._hdr(lm, "last-modified")[0]
        h = self._h({"If-Modified-Since": lm_val})
        self.assertTrue(WFSRequestHandler._serve_static(h))
        self.assertEqual(self._code(h), 304)
        self.assertFalse(self._hdr(h, "content-length"))
        self.assertTrue(self._hdr(h, "last-modified"))

    def test_get_ims_older_200(self):
        from wfs_hq_server import H as WFSRequestHandler
        h = self._h({"If-Modified-Since":
                     static_serve.http_date(1759999999)})
        self.assertTrue(WFSRequestHandler._serve_static(h))
        self.assertEqual(self._code(h), 200)

    def test_etag_wins_over_stale_ims(self):
        # ETag cocok + IMS terlalu lama → tetap 304 (ETag menang).
        from wfs_hq_server import H as WFSRequestHandler
        data = open(self.file, "rb").read()
        etag = static_serve.etag_for(data)
        h = self._h({"If-None-Match": etag,
                     "If-Modified-Since": static_serve.http_date(1)})
        self.assertTrue(WFSRequestHandler._serve_static(h))
        self.assertEqual(self._code(h), 304)

    def test_head_ims_match_304(self):
        from wfs_hq_server import H as WFSRequestHandler
        h = self._h({"If-Modified-Since":
                     static_serve.http_date(1760000000)})
        self.assertTrue(WFSRequestHandler._serve_head_static(h))
        self.assertEqual(self._code(h), 304)
        self.assertFalse(self._hdr(h, "content-length"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
