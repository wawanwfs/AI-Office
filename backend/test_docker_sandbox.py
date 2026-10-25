"""Unit test untuk modul docker_sandbox.py (backend WFS AI-Office).

Hanya menguji fungsi murni/aman yang TIDAK menyentuh Docker nyata:
- get_workspace_path (inkl. penolakan path traversal)
- is_port_free / allocate_port (logic alokasi port, DB di-mock)
- scaffold_project (penulisan scaffold ke PROJECTS_ROOT yang di-redirect ke tmp_path)
"""
import socket

import pytest

import docker_sandbox
from docker_sandbox import DockerSandboxManager


# ---------------- get_workspace_path ----------------

def test_workspace_path_normalisasi_dan_join(tmp_path, monkeypatch):
    monkeypatch.setattr(docker_sandbox, "PROJECTS_ROOT", str(tmp_path))
    ws = DockerSandboxManager.get_workspace_path("proyek-1")
    assert ws == str((tmp_path / "proyek-1").resolve())
    assert tmp_path.exists()


def test_workspace_path_menolak_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(docker_sandbox, "PROJECTS_ROOT", str(tmp_path))
    for jahat in ("../escape", "../../../etc", "/tmp/absolut", "a/../../escape"):
        with pytest.raises(PermissionError):
            DockerSandboxManager.get_workspace_path(jahat)


# ---------------- is_port_free / allocate_port ----------------

def test_is_port_free_true_saat_tidak_dipakai():
    # cari port bebas ephemeral lalu cek
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    assert DockerSandboxManager.is_port_free(port) is True


def test_is_port_free_false_saat_sedang_dipakai():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.listen(1)
        assert DockerSandboxManager.is_port_free(port) is False


class _FakeConn:
    def __init__(self, used_ports):
        self._used = used_ports

    def cursor(self):
        return _FakeCursor(self._used)

    def close(self):
        pass


class _FakeCursor:
    def __init__(self, used_ports):
        self._used = used_ports

    def execute(self, sql):
        pass

    def fetchall(self):
        return [(p,) for p in self._used]


def _patch_db_and_free_ports(monkeypatch, used_ports):
    monkeypatch.setattr(docker_sandbox, "get_db", lambda: _FakeConn(used_ports))
    # semua port dalam rentang dianggap bebas → hanya logika DB yang diuji
    monkeypatch.setattr(DockerSandboxManager, "is_port_free", lambda p: True)


def test_allocate_port_mengembalikan_port_pertama_bebas(monkeypatch):
    _patch_db_and_free_ports(monkeypatch, [])
    assert DockerSandboxManager.allocate_port() == docker_sandbox.PORT_RANGE_START


def test_allocate_port_melompati_port_yang_dipakai_db(monkeypatch):
    _patch_db_and_free_ports(monkeypatch, [docker_sandbox.PORT_RANGE_START])
    assert DockerSandboxManager.allocate_port() == docker_sandbox.PORT_RANGE_START + 1


def test_allocate_port_menaikkan_runtimeerror_saat_habis(monkeypatch):
    used = list(range(docker_sandbox.PORT_RANGE_START, docker_sandbox.PORT_RANGE_END))
    _patch_db_and_free_ports(monkeypatch, used)
    with pytest.raises(RuntimeError, match="No available preview ports"):
        DockerSandboxManager.allocate_port()


# ---------------- scaffold_project ----------------

def test_scaffold_membuat_file_index_dockerfile_test(tmp_path, monkeypatch):
    monkeypatch.setattr(docker_sandbox, "PROJECTS_ROOT", str(tmp_path))
    ws = DockerSandboxManager.scaffold_project("p1", "Demo Web")

    index = (tmp_path / "p1" / "index.html")
    assert "Demo Web" in index.read_text(encoding="utf-8")
    assert "WFS PROJECT" in index.read_text(encoding="utf-8")
    assert "<html" in index.read_text(encoding="utf-8")

    dockerfile = (tmp_path / "p1" / "Dockerfile")
    assert "FROM python:3.12-slim" in dockerfile.read_text(encoding="utf-8")

    testfile = (tmp_path / "p1" / "test_app.py")
    assert "test_index_exists" in testfile.read_text(encoding="utf-8")
    assert ws == str((tmp_path / "p1").resolve())


def test_scaffold_idempoten_tidak_menimpa_file_ada(tmp_path, monkeypatch):
    monkeypatch.setattr(docker_sandbox, "PROJECTS_ROOT", str(tmp_path))
    DockerSandboxManager.scaffold_project("p2", "Nama Awal")

    index = tmp_path / "p2" / "index.html"
    index.write_text("KONTEN KUSTOM", encoding="utf-8")

    DockerSandboxManager.scaffold_project("p2", "Nama Baru")
    assert index.read_text(encoding="utf-8") == "KONTEN KUSTOM"
