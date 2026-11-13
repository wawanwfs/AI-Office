# WFS AI Office — Phase 29 accelerated execution prompt

Start from exact green main. Read Phase 28 REA, rotation runbook and the
two-tenant proof. Preserve accepted gates. No force push, deployment,
signing-root reset, or billable AI.

1. Separate the actual BuildKit daemon from the runtime operator. Run the
   builder as a distinct unprivileged principal using a dedicated socket.
   Verify no operator Docker access, sealed context handoff, independent
   verification of the OCI result, and operator-only promotion.
2. Demonstrate signed journal rotation across independently administered
   custody where suitable infrastructure exists. Preserve archived windows,
   rotate multiple times, and deny lost-state rebootstrap, stale approvals,
   and forks. Do not bypass the existing durable and external anchor checks.
3. Preserve actual two-tenant signed HTTP and Windows-native fail-closed.
   Validate WSL2/Docker Desktop only on suitable infrastructure. If adding
   periodic enforcement, use a bounded lease and non-destructive stop.
4. Keep external WORM, network policy, tenant HTTPS, dependency closure,
   coordinated recovery, live telemetry and invoice reconciliation
   separately tracked. Require owner authorization for any paid provider.

Land at least one bounded gate. Verify all 13 jobs on branch, PR and
merged main. Report exact SHAs, scoped progress, limits and next prompt.
