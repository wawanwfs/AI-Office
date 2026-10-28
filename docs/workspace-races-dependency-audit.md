# Workspace request isolation and npm audit

Final base: `3704396e8a0c770e0a924a6c4fcb07b747a7d6a5` (preserved partial changes transplanted onto rebased main).

## Resume verification — supersedes historical results below

- Eight regression tests against the unchanged base component: **8 failed**; restored implementation: **8 passed**.
- Fresh base-lock audit: **16 findings (8 high, 2 moderate, 6 low)**. Updated lock audit after clean npm ci and another non-force `npm audit fix --ignore-scripts`: **4 low, no moderate/high/critical**. Production-only audit: **zero**.
- Remaining findings: deepmerge advisory GHSA-gcqx-w48m-w2h4, propagated through @rollup/plugin-node-resolve, workbox-build, vite-plugin-pwa. Registry latest deepmerge is affected 4.3.1. npm proposes a breaking downgrade to vite-plugin-pwa 0.2.1; intentionally not applied. No manifest changes or overrides.
- Full suite on resumed base: **168 files passed, 1 failed; 2274 tests passed, 2 failed (2276 total)**. Both failures are existing ShConsole workspace tests; rerunning ShConsole with the base ProjectWorkspaceModal also fails two tests. Their helper can select before project options load; one test settles the same promise twice, another never rerenders show after a no-op close. Unrelated tests were left untouched.
- Clean npm ci, build (including PWA), lint, and diff whitespace check passed. Regression file passes 8/8.
- Evidence: `/home/agentuser/.hermes/cache/scratch/workspace-resume-{red,ci,tests,targeted,baseline,build,lint,fix}.log`, `workspace-resume-audit.json`, `workspace-resume-base-audit/audit.json`.
- Initial pull/rebase attempted to replay already-rebased stage-one changes and conflicted; aborted, then transplanted this branch onto the supplied base without replaying old commits. All partial files preserved.

## Historical interrupted-child report (audit/suite counts superseded above)

Original base: `64286b7566ce0e419d2b3dfb388d87215f85bec4`. Work performed only in an isolated worktree; no main edits, push, deployment, or worker changes.

## Request correctness

Project/open sessions now mount independent workspace state, so pending file lists, editor reads, terminal output, and save feedback cannot populate another project or a reopened modal. File selection/retry uses a monotonically increasing request identity, invalidated immediately on selection and on effect cleanup; stale success and error responses cannot replace the current editor. Restart completion cannot call the parent refresh callback after its session unmounts. HTTP terminal failures are checked before parsing an execution result.

Regression tests first reproduced old-file content overwriting the selected editor, old-project file lists replacing current lists, HTTP 403/500/503 appearing as undefined exit codes, and stale restart callbacks. Additional coverage checks saved path/content and switch/reopen state reset (8 new tests).

## Actual npm audit

Initial `npm audit --json`: **12 vulnerable packages: 8 high, 2 moderate, 2 low**. Vulnerable packages: @babel/core, @humanfs/node, brace-expansion, fast-uri, js-yaml, nanoid, postcss, serialize-javascript, source-map-js, undici, vite, zod.

Applied `npm audit fix --ignore-scripts` without `--force`, overrides, or manifest range changes. Only package-lock.json changed. Vite moved from 8.0.3 to 8.3.5 within ^8.0.1; its compatible dependency graph was updated. Other remediated versions include @babel/core 7.29.7, @humanfs/node 0.16.8, brace-expansion 1.1.21, fast-uri 3.1.9, js-yaml 4.3.2, nanoid 3.3.20, postcss 8.5.32, serialize-javascript 7.1.4, source-map-js 1.2.2, undici 8.12.3, zod 4.6.7.

Final clean `npm ci`, followed by `npm audit --json`: **0 vulnerabilities**. This is the registry audit result, not a guarantee that no vulnerabilities exist.

## Verification

On the final dependency graph after clean npm ci:
- `npm test`: **168 files, 2259 tests passed**.
- `npm run build`: passed, including PWA service-worker generation.
- `npm run lint`: passed.
- `git diff --check`: passed.

Non-blocking output: jsdom navigation/canvas not-implemented messages during the suite; npm warns that glob@11.1.0 is deprecated. The final audit reports no vulnerable glob finding; no forced upgrade was attempted. Backend tests and live deployment were not exercised (changes are frontend/JS dependencies only). In-flight server mutations are not cancelled or rolled back by closing/switching the modal; their stale UI results are isolated.

Raw command logs are under `/home/agentuser/.hermes/cache/scratch/workspace-*` on the execution host.
