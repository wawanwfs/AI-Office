> **Phase 18 update:** The local reference HTTP log now optionally serves
> *pinned TLS 1.2+* on loopback, and a separate operator-only verifier
> checks two TLS log endpoints with separately verified certificates,
> signed heads and compact-prefix consistency. The acceptance tests
> still run both endpoints on ONE CI host; this does not prove an
> external independent authority or WORM. See
> [Phase 18 TLS/gossip operator runbook](PHASE18_RUNTIME_RUNBOOK.md).

# Phase 17 — local reference transparency HTTP log runbook

**Test-only.** A real loopback HTTP service with digest-only authenticated
append, persistent verified JSONL, signed RFC6962 heads and compact proof
HTTP endpoints. It is NOT an independent public log, HTTPS/mTLS, WORM,
rootless isolated host, external organizational authority or replacement
for independently approved Phases 12–16 preview source admission.

## Safety and API

The server binds ONLY \`127.0.0.1\` and requires a long bearer token
supplied via \`WFS_REF_LOG_TOKEN\` for every request. Never expose it
through a tunnel, proxy or public URL. A separate Ed25519 PKCS8 private
PEM signs tree heads; it MUST differ from reviewer, roster and witness
signers, remain out of GitHub and be owner-only on POSIX (0600). Windows
requires independently locked-down NTFS ACLs. Reference CI creates
synthetic temporary keys, never production organizational approval.

The API responds with a signed \`head\`, \`head_bytes_base64\`, and
\`head_signature_base64\`:

- \`GET /v1/head\`: latest signed size and root.
- \`GET /v1/inventory\`: complete ordered receipt SHA256 digests.
- \`GET /v1/proof?previous_size=1\`: signed head and compact
  inclusion/consistency proof for the current (last) receipt.
- \`POST /v1/append\`: JSON object with precisely
  \`receipt_sha256\`, \`expected_size\`, and
  \`expected_root_sha256\`. A mismatch is rejected. The receipt
  digest must come from a separately approved signed witness;
  uploading any 64-digit digest is NOT approval.

## Disposable Windows 10/11 PowerShell run

Provision a separate test-only private signer PEM and an existing
locked-down directory outside the repository. Run in a dedicated
PowerShell session:

\`\`\`powershell
$env:WFS_REF_LOG_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(40))"
python backend/reference_transparency_log.py --journal "C:\WFS-Private\test-reference-log.jsonl" --private-key "C:\WFS-Private\test-log-key.pem" --port 18847
\`\`\`

From another terminal with the same test-only token:

\`\`\`powershell
$headers = @{ Authorization = "Bearer $env:WFS_REF_LOG_TOKEN" }
Invoke-RestMethod -Headers $headers -Uri "http://127.0.0.1:18847/v1/head"
\`\`\`

For proof verification, never trust a hash or fingerprint supplied by
the same untrusted response. The signed head must be independently
pinned, the signer fingerprint must be provisioned via a different
trusted channel, and the previous tree root must be archived outside
the server/journal. The existing Phase 15/16 verifier can consume
the returned signed-head, complete inventory and compact proof data.

## Reproduce real CI tests

\`\`\`powershell
$env:PYTHONPATH = "backend"
python -m pytest backend/test_reference_transparency_log.py -q
\`\`\`

Tests use ACTUAL loopback TCP, independent Python service process,
two different independent verifier processes on the SAME host,
disk fsync/restart and verified journal recovery, replayed prior
signed heads, a malicious competing fork using the SAME signer,
outages, malformed requests, and live tampering. The Linux, native
Windows and dynamic-preview-operator jobs run the new tests. The
existing disposable two-tenant Docker operator still runs without
granting Docker access to the reference log or the HTTP gateway.

**Limitations:** JSONL+fsync is not physical append-only / WORM.
A malicious same-UID actor can change journal data or race reads,
and replacing all trusted pins can reenable stale histories.
The loopback service has no secure TLS identity, signing-device
provenance, external hosted trust, cross-host gossip, freshness SLA
or revocation issuance. DO NOT deploy it to production.
