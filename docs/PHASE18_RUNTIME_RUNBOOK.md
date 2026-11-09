# Phase 18 — pinned HTTPS gossip verifier (Windows / Linux)

**Scope:** actual TLS tests and signed Merkle consistency between two explicitly configured endpoints. The test runner launches both endpoints as separate processes on **ONE** GitHub Actions machine. Do not describe this as independent-host or production transparency.

Start with the Phase 17 runtime guide, Phase 15 signed tree-head runbook, and Phase 16 compact RFC6962 proof guide. The existing reviewer, roster root, witness and log signing pins still apply and are never automatically approved from a downloaded response.

## Reproduce test evidence

On Windows PowerShell, using an isolated Python 3.11 environment and project dependencies:

```powershell
python -m pip install -r requirements-pytest.txt
python -m pip install -r requirements-preview-crypto.txt
$env:PYTHONPATH = "backend"
python -m pytest backend/test_reference_transparency_log.py backend/test_reference_log_gossip.py -q
```

The Phase 18 tests generate **disposable synthetic certificates and signing keys** (not checked into GitHub), start two genuine loopback TLS services, open actual verified HTTPS connections, test certificate pin mismatches, invalid trusted CA, bearer denial, signed-head forks, stale history, lag and outage. A separately launched owner-style CLI is also tested.

## Run a private TLS reference service

Operators must independently provision test-only certificates including a valid Subject Alternative Name for the requested host/IP, and restrict TLS private key/Ed25519 signer key access. The reference service itself **always binds only 127.0.0.1** and is not a remotely reachable production authority:

```powershell
$env:WFS_REF_LOG_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(40))"
python backend/reference_transparency_log.py --journal "C:\WFS-Private\ref-alpha.jsonl" --private-key "C:\WFS-Private\test-log-signing.pem" --tls-cert "C:\WFS-Private\test-alpha-cert.pem" --tls-key "C:\WFS-Private\test-alpha-key.pem" --port 18847
```

Use a second independent private directory, **different test TLS certificate**, different journal, and port 18848 for the second reference process. In this CI/reference model, both endpoints can share an intentionally synthetic log signing key solely to test signed equivocation detection. This is not approved real key custody.

## Verify two endpoints without command-line secrets

Independently approve and record **each** root CA trust PEM and TLS leaf certificate SHA256 fingerprint, and the RAW Ed25519 log public key SHA256 fingerprint. Archive a separately trusted earlier tree size/root. Do not infer any of those from downloaded responses or from an AI agent. Set bearer tokens in the operator's private process environment:

```powershell
$env:WFS_LOG_PRIMARY_BEARER = "<operator-provisioned-private-token>"
$env:WFS_LOG_MIRROR_BEARER  = "<separately-provisioned-private-token>"
python scripts/wfs_phase18_gossip_check.py --primary-url "https://127.0.0.1:18847" --primary-ca "C:\WFS-Private\test-alpha-cert.pem" --primary-tls-pin "<independently-verified-alpha-leaf-DER-SHA256>" --mirror-url "https://127.0.0.1:18848" --mirror-ca "C:\WFS-Private\test-bravo-cert.pem" --mirror-tls-pin "<independently-verified-bravo-leaf-DER-SHA256>" --log-public-key "C:\WFS-Private\test-log-public.pem" --log-key-pin "<independently-pinned-log-key-fingerprint>" --previous-size 1 --previous-root "<independently-archived-prior-Merkle-root>"
```

The CLI exits with success only when both TLS identities, signatures and consistency proofs verify and the two heads match. It exits nonzero for an offline endpoint, lagging replica, fork, rollback, rejected certificate, invalid bearer or forged evidence. Its output never includes bearer values.

**Limitations:** no mTLS, independently hosted transparency service, WORM/object-lock, cross-host gossip, independent live revocation authority or external freshness counter. TLS protects the chosen test transport; it does not make two processes on the same host independent. This diagnostic does not alter the production preview manager's separate signed approval requirements, enable paid model calls, or open a public route.
