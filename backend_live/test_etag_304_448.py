"""Siklus 448 — ETag + If-None-Match 304 di jalur statis 9503.

Kontrak sumber (backend/static_serve.py + backend_live/wfs_hq_server.py):
- _serve_static menghitung ETag konten (sha1 kuot) dan mengirimnya di 200.
- If-None-Match cocok → 304 TANPA body, TANPA Content-Length, ETag tetap ada.
- not_modified(): weak compare (W/ prefix diabaikan), daftar dipisah koma, "*".
- HEAD statis ikut mengirim ETag (konsistensi metadata GET/HEAD).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wfs_hq_server import H  # noqa: E402
import static_serve  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "backend"))
static_serve = static_serve  # keep name


class TestEtagHelpers(unittest.TestCase):
    def test_etag_stable_quoted_sha1(self):
        a = static_serve.etag_for(b"hello")
        b = static_serve.etag_for(b"hello")
        c = static_serve.etag_for(b"world")
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertTrue(a.startswith('"') and a.endswith('"'))

    def test_not_modified_cases(self):
        etag = static_serve.etag_for(b"x")
        self.assertTrue(static_serve.not_modified(etag, etag))
        self.assertTrue(static_serve.not_modified('W/' + etag, etag))
        self.assertTrue(static_serve.not_modified(f'"other", {etag}', etag))
        self.assertTrue(static_serve.not_modified("*", etag))
        self.assertFalse(static_serve.not_modified("", etag))
        self.assertFalse(static_serve.not_modified('"zzz"', etag))


class TestServeStatic304(unittest.TestCase):
    def _serve(self, relpath, headers=None):
        handler = H.__new__(H)
        handler.path = "/" + relpath
        handler.headers = headers or {}
        handler._wfs_cc = "no-store"
        handler.directory = os.getcwd()
        sent = {}

        def send_response(code):
            sent["code"] = code

        def send_header(name, value):
            sent.setdefault("headers", []).append((name, value))

        def end_headers():
            sent["ended"] = True

        handler.send_response = send_response
        handler.send_header = send_header
        handler.end_headers = end_headers

        class _W:
            data = b""

            def write(self, b):
                self.data += b

        handler.wfile = _W()
        served = H._serve_static(handler)
        return served, sent, handler.wfile.data

    def test_200_has_etag(self):
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "_tmp_etag_448", "assets")
        os.makedirs(tmp, exist_ok=True)
        old = os.getcwd()
        with open(os.path.join(tmp, "a-448.js"), "wb") as f:
            f.write(b"console.log(448)")
        try:
            os.chdir(os.path.dirname(tmp))
            served, sent, data = self._serve("assets/a-448.js")
            self.assertTrue(served)
            self.assertEqual(sent.get("code"), 200)
            self.assertEqual(data, b"console.log(448)")
            hdrs = dict(sent.get("headers", []))
            self.assertIn("ETag", hdrs)
            self.assertEqual(hdrs["ETag"],
                             static_serve.etag_for(b"console.log(448)"))
        finally:
            os.chdir(old)

    def test_304_no_body_no_content_length(self):
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "_tmp_etag_448", "assets")
        old = os.getcwd()
        etag = static_serve.etag_for(b"console.log(448)")
        try:
            os.chdir(os.path.dirname(tmp))
            served, sent, data = self._serve(
                "assets/a-448.js", {"If-None-Match": etag})
            self.assertTrue(served)
            self.assertEqual(sent.get("code"), 304)
            self.assertEqual(data, b"")
            hdrs = dict(sent.get("headers", []))
            self.assertNotIn("Content-Length", hdrs)
            self.assertNotIn("Content-Type", hdrs)
            self.assertEqual(hdrs.get("ETag"), etag)
            self.assertTrue(sent.get("ended"))
        finally:
            os.chdir(old)


if __name__ == "__main__":
    unittest.main()
