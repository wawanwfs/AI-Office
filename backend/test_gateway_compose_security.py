"""Static least-privilege guarantees for compose manifests.

These tests DO NOT claim actual Docker runtime proof. Run a real cutover
rehearsal separately before any deployment.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / "deploy/docker/compose.go-live.yaml"
REHEARSAL = ROOT / "deploy/docker/compose.rehearsal.yaml"


def _active_lines(path):
    return "\n".join(line for line in path.read_text().splitlines()
                     if line.strip() and not line.lstrip().startswith("#"))


def test_http_gateway_does_not_get_docker_socket_or_host_network():
    for path in (GO, REHEARSAL):
        config = _active_lines(path)
        assert "/var/run/docker.sock" not in config
        assert "/hermes-home/.hermes/.env:" not in config
        assert "network_mode: host" not in config
        assert "privileged: true" not in config
        assert "cap_drop:" in config and "no-new-privileges:true" in config
        assert "pids_limit:" in config and "mem_limit:" in config


def test_migrated_production_gateway_preserves_existing_loopback_contract():
    config = _active_lines(GO)
    assert re.search(r"127\.0\.0\.1:8787:8787",config)
    assert 'WFS_PORT: "8787"' in config
    assert 'user: "1002:1003"' in config


def test_http_gateway_image_contains_no_docker_cli_or_socket_bootstrap():
    src=(ROOT/"deploy/docker/Dockerfile.wfs-office-gw").read_text()
    assert "download.docker.com/linux/static" not in src
    assert "ADD https://" not in src
    assert "docker --version" not in src
    assert "COPY docker-entrypoint.sh" in src
