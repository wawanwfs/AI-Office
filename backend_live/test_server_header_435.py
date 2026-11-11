"""Siklus 435: header Server generik (anti fingerprinting versi Python).

Dulu: "Server: SimpleHTTP/0.6 Python/3.12.3" membocorkan versi interpreter
produksi ke pemindai otomatis. Kini: "Server: wfs" tanpa sys_version.
"""
import io
import unittest
from unittest import mock

import wfs_hq_server


class _FakeHandler:
    """Cukup untuk version_string() (method SimpleHTTPRequestHandler)."""

    server_version: str = ""
    sys_version: str = ""

    def version_string(self) -> str:
        return self.server_version + " " + self.sys_version


class TestServerHeader435(unittest.TestCase):
    def test_version_string_generic(self):
        h = _FakeHandler()
        h.server_version = wfs_hq_server.H.server_version
        h.sys_version = wfs_hq_server.H.sys_version
        self.assertEqual(h.version_string(), "wfs ")

    def test_no_python_version_leak(self):
        self.assertNotIn("Python", wfs_hq_server.H.sys_version)
        self.assertNotIn("SimpleHTTP", wfs_hq_server.H.server_version)


if __name__ == "__main__":
    unittest.main()
