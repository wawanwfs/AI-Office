"""Phase 13: REAL controlled A/AAAA UDP DNS rebinding in disposable Docker CI.

Starts a strictly ephemeral authoritative DNS sidecar on the operator
template's internal-only network. The fixed API container performs real
UDP DNS queries to that peer, sees alternating A and AAAA answers, and
attempts outbound TCP connections to each returned address. This is a
network-path regression, NOT proof of an externally hosted authority,
Windows/WSL2 host firewall, rootless Docker or production isolation.
"""
import hashlib
import json
import subprocess

from preview_admission_v2 import AdmissionDenied

# No incoming requests from an untrusted agent define a name, an IP, a
# container image, flags or a Docker command. All scripts are fixed CI proof.
_DNS_SERVER = r'''
import ipaddress
import socket
import struct

EXPECTED = b"\x07rebound\x07preview\x07invalid\x00"
CHOICES = {
    1: ("169.254.169.254", "1.1.1.1"),
    28: ("2001:4860:4860::8888", "2606:4700:4700::1111"),
}
seen = {1: 0, 28: 0}
server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server.bind(("0.0.0.0", 1053))
print("ephemeral controlled DNS ready", flush=True)
while True:
    packet, address = server.recvfrom(2048)
    if len(packet) < 12 or packet[12:12 + len(EXPECTED)] != EXPECTED:
        continue
    question = packet[12:12 + len(EXPECTED) + 4]
    if len(question) != len(EXPECTED) + 4:
        continue
    qtype, qclass = struct.unpack("!HH", question[-4:])
    if qtype not in CHOICES or qclass != 1:
        continue
    answer = CHOICES[qtype][min(seen[qtype], 1)]
    seen[qtype] += 1
    payload = ipaddress.ip_address(answer).packed
    # Authoritative response (AA set), one question, one answer, TTL=0.
    header = packet[:2] + struct.pack("!HHHHH", 0x8400, 1, 1, 0, 0)
    rr = b"\xc0\x0c" + struct.pack("!HHIH", qtype, 1, 0, len(payload)) + payload
    server.sendto(header + question + rr, address)
'''

_DNS_CLIENT = r'''
import json
import os
import socket
import struct
import time

NAME = b"\x07rebound\x07preview\x07invalid\x00"
EXPECTED = {
    1: ["169.254.169.254", "1.1.1.1"],
    28: ["2001:4860:4860::8888", "2606:4700:4700::1111"],
}
network_ip = None
for attempt in range(20):
    try:
        network_ip = socket.gethostbyname("wfs-controlled-dns")
        break
    except OSError:
        time.sleep(.15)
if network_ip is None:
    raise SystemExit("Docker internal DNS sidecar hostname unresolved")

def answer(qtype, index):
    question = NAME + struct.pack("!HH", qtype, 1)
    txid = (0x3100 + qtype * 4 + index).to_bytes(2, "big")
    query = txid + struct.pack("!HHHHH", 0x0100, 1, 0, 0, 0) + question
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as channel:
        channel.settimeout(3)
        channel.sendto(query, (network_ip, 1053))
        reply, source = channel.recvfrom(2048)
    if source[0] != network_ip or reply[:2] != txid or len(reply) < 12:
        raise SystemExit("controlled DNS authenticity check failed")
    flags, questions, answers, _, _ = struct.unpack("!HHHHH", reply[2:12])
    if flags != 0x8400 or questions != 1 or answers != 1:
        raise SystemExit("controlled authoritative DNS response malformed")
    if reply[12:12 + len(question)] != question:
        raise SystemExit("controlled DNS echoed wrong question")
    rr = reply[12 + len(question):]
    if len(rr) < 12 or rr[:2] != b"\xc0\x0c":
        raise SystemExit("controlled DNS answer header malformed")
    typ, klass, ttl, size = struct.unpack("!HHIH", rr[2:12])
    if typ != qtype or klass != 1 or ttl != 0 or len(rr) != 12 + size:
        raise SystemExit("controlled DNS answer type, TTL or length invalid")
    family = socket.AF_INET if qtype == 1 else socket.AF_INET6
    return socket.inet_ntop(family, rr[12:])

results = {}
for typ, label, family in ((1, "A", socket.AF_INET),
                           (28, "AAAA", socket.AF_INET6)):
    values = []
    for index, expected in enumerate(EXPECTED[typ]):
        # Retry only if the sidecar is not yet listening. No spoofed
        # fallback or simulated getaddrinfo monkeypatch is accepted.
        for retry in range(8):
            try:
                resolved = answer(typ, index)
                break
            except (socket.timeout, ConnectionRefusedError):
                if retry == 7:
                    raise
                time.sleep(.15)
        if resolved != expected:
            raise SystemExit("controlled DNS rebinding sequence mismatch")
        values.append(resolved)
        destination_port = 80 if resolved == "169.254.169.254" else 443
        with socket.socket(family, socket.SOCK_STREAM) as outbound:
            outbound.settimeout(2)
            try:
                outbound.connect((resolved, destination_port))
            except OSError:
                pass
            else:
                raise SystemExit("REBOUND ADDRESS REACHED OUTSIDE INTERNAL NET")
    results[label] = {"answers": values, "outbound_connections_blocked": True}
if any(key.lower() in ("http_proxy", "https_proxy", "all_proxy")
       for key in os.environ):
    raise SystemExit("untrusted proxy environment in API")
if os.path.exists("/var/run/docker.sock"):
    raise SystemExit("Docker daemon socket unexpectedly exposed inside API")
results["real_udp_dns_response_received"] = True
results["real_authoritative_aa_bit_checked"] = True
results["docker_daemon_socket_absent"] = True
results["host_firewall_certified"] = False
results["rootless_daemon_certified"] = False
print(json.dumps(results, sort_keys=True))
'''


def _docker(*argv):
    cmd = ["docker", *argv]
    # Explicit deadline required by existing subprocess-hardening audit.
    result = subprocess.run(cmd, capture_output=True, text=True,
                            timeout=45, check=False)
    if result.returncode:
        raise AssertionError("disposable controlled DNS Docker command failed")
    return result.stdout.strip()


def prove_real_docker_dns_rebinding(manager, project_id, token):
    """Run a separate no-egress DNS container and test from the live API."""
    record = manager.status(project_id)
    compose_name = record["compose_name"]
    suffix = hashlib.sha256(project_id.encode("ascii")).hexdigest()[:12]
    name = "wfs-ci-authoritative-dns-" + suffix
    network = compose_name + "_preview-internal"
    # Same already-digest-pinned Python base used by the fixed reviewed
    # Compose, with neither internet access nor privileged host mounts.
    image = ("python:3.11-alpine@sha256:"
             "bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa")
    _docker("run", "-d", "--rm", "--pull=never",
            "--name", name, "--network", network,
            "--network-alias", "wfs-controlled-dns",
            "--user", "65534:65534", "--read-only",
            "--cap-drop=ALL", "--pids-limit=32", "--memory=64m",
            "--security-opt=no-new-privileges:true",
            image, "python", "-u", "-c", _DNS_SERVER)
    try:
        output = manager._invoke(
            record, token, ["exec", "-T", "api", "python", "-c", _DNS_CLIENT],
            timeout=70)
        try:
            report = json.loads(output.strip())
        except (ValueError, TypeError) as exc:
            raise AssertionError("controlled DNS test did not provide JSON") from exc
        assert report["real_udp_dns_response_received"] is True
        assert report["real_authoritative_aa_bit_checked"] is True
        assert report["docker_daemon_socket_absent"] is True
        assert report["A"]["answers"] == ["169.254.169.254", "1.1.1.1"]
        assert report["AAAA"]["answers"] == [
            "2001:4860:4860::8888", "2606:4700:4700::1111"]
        assert report["A"]["outbound_connections_blocked"] is True
        assert report["AAAA"]["outbound_connections_blocked"] is True
        assert report["host_firewall_certified"] is False
        return report
    finally:
        # Docker --rm assures lifecycle cleanup even when the test fails.
        _docker("rm", "-f", name)
