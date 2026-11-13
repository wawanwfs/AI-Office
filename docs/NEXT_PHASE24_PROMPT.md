# WFS AI Office — Phase 24 accelerated execution prompt

Start from exact green `main`. Review Phase 23 REA and the OCI runbook,
the verifier and approval modules, the latest proof artifact, and the
Phase 22 two-tenant runtime. Preserve all green checks. No force push,
production deployment, signing-root reset, or paid provider access.

## P0 — Promote an approved OCI release without trusting local image tags

1. Design a bounded, fail-closed **runtime admission** that consumes the
   same archive bytes checked by the Phase 23 offline verifier and
   binds them to the image actually used by Compose. Keep separate
   identifiers for manifest, config and runtime instance. Reject missing
   or rolled-back approvals and version/platform/manifest substitutions.
   Keep the mount-free preview and no-pull/no-build Compose controls.
2. Prove the promotion on disposable Linux runners for two tenants.
   Show that the verified release corresponds to the running images and
   reviewed HTTP asset hashes. Verify stop/restart/recovery without a
   writable fallback, and keep Windows-native startup fail-closed.
3. Where infrastructure allows, move builder, verifier and operator to
   distinct OS principals. Use independently provisioned witness pins,
   trusted time and an append-only revocation source. Do not claim
   daemon or off-host trust isolation if only synthetic CI is available.

Keep offline dependency closure, external mTLS/WORM and host networking,
public preview authorization, multi-database recovery, Office telemetry,
and CostLedger reconciliation distinct. Paid AI still requires explicit
owner authorization for model, credential, pricing and hard spend caps.

Deliver at least one bounded gate and verify all 13 jobs on the exact
branch, PR and merged `main`. Report the exact SHAs and scoped count,
state any unproven boundaries, and add an executable next prompt.
