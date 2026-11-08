"""Active disposable Docker preview egress checks, not a production firewall audit.

The API is an actual running Docker container. We exercise direct public IPv4,
metadata IPv4, public IPv6 and simulated post-resolution DNS rebinding. A
DNS-rebind simulation cannot establish independent host DNS firewall policy.
"""
import json

# This is a Python program executed ONLY inside the fixed reviewed CI API
# container, via operator-only docker compose exec (never a user string).
_IN_CONTAINER = r'''
import json
import os
import socket

CHECKS = (
    ("public_ipv4_https", socket.AF_INET, "1.1.1.1", 443),
    ("metadata_ipv4", socket.AF_INET, "169.254.169.254", 80),
    ("public_ipv4_dns_tcp", socket.AF_INET, "8.8.8.8", 53),
    ("public_ipv6_https", socket.AF_INET6, "2606:4700:4700::1111", 443),
    ("public_ipv6_dns_tcp", socket.AF_INET6, "2001:4860:4860::8888", 53),
)
proof = {}
for name, family, address, port in CHECKS:
    with socket.socket(family, socket.SOCK_STREAM) as s:
        s.settimeout(2)
        try:
            s.connect((address, port))
        except OSError:
            proof[name] = "blocked"
        else:
            raise SystemExit("PUBLIC EGRESS CONNECTED: " + name)

# This is an explicit resolver substitution / DNS-rebinding simulation, not
# a real remote DNS query. Test the actual container socket AFTER resolution.
original_getaddrinfo = socket.getaddrinfo
def rebound(host, port, *args, **kwargs):
    if host == "rebind.invalid":
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "",
                 ("169.254.169.254", 80))]
    return original_getaddrinfo(host, port, *args, **kwargs)

socket.getaddrinfo = rebound
try:
    with socket.create_connection(("rebind.invalid", 80), timeout=2):
        raise SystemExit("DNS-REBOUND METADATA EGRESS CONNECTED")
except OSError:
    proof["simulated_dns_rebinding_metadata"] = "blocked"
finally:
    socket.getaddrinfo = original_getaddrinfo

# Operator's subprocess env is allowlisted, not ambient HTTP proxy settings;
# the container also must have no proxy variables of its own.
proof["container_proxy_environment_absent"] = not any(
    name.lower() in ("http_proxy", "https_proxy", "all_proxy")
    for name in os.environ)
if not proof["container_proxy_environment_absent"]:
    raise SystemExit("UNAPPROVED PROXY ENVIRONMENT PRESENT")

# Observe actual DNS resolution where available, but DO NOT mark it a security
# gate: Docker's internal DNS can forward queries independently of app egress.
try:
    addresses = original_getaddrinfo("example.com", 443, type=socket.SOCK_STREAM)
    proof["public_dns_observed"] = bool(addresses)
except OSError:
    proof["public_dns_observed"] = False
proof["public_dns_observation_is_a_firewall_gate"] = False
proof["real_dns_rebinding_proven"] = False
print(json.dumps(proof, sort_keys=True))
'''


def prove_disposable_container_egress(manager, project_id, token):
    record = manager.status(project_id)
    output = manager._invoke(record, token, ["exec", "-T", "api", "python", "-c",
                                              _IN_CONTAINER], timeout=55)
    try:
        report = json.loads(output.strip())
    except (ValueError, TypeError) as exc:
        raise AssertionError("container did not return network evidence") from exc
    required = ("public_ipv4_https", "metadata_ipv4", "public_ipv4_dns_tcp",
                "public_ipv6_https", "public_ipv6_dns_tcp",
                "simulated_dns_rebinding_metadata")
    assert all(report.get(name) == "blocked" for name in required)
    assert report["container_proxy_environment_absent"] is True
    assert report["real_dns_rebinding_proven"] is False
    assert report["public_dns_observation_is_a_firewall_gate"] is False
    return report
