from pathlib import Path
import pytest
from scripts.ci_secret_scan import inspect_bytes


def test_high_confidence_secrets_are_rejected_without_echo():
    examples=[
        b"-----" + b"BEGIN OPENSSH PRIVATE KEY-----",
        b"AKIA"+"X".encode()*16,
        b"ghp_" + b"A"*36,
        b"sk-proj-" + b"A"*48,
    ]
    for data in examples:
        assert inspect_bytes(data)


def test_placeholders_do_not_trigger_real_secret_scanner():
    for value in (b"API_KEY=example-placeholder",b"no secrets",
                  b"sk-test",b"-----BEGIN PUBLIC KEY-----"):
        assert not inspect_bytes(value)
