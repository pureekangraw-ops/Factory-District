# Existing Factory runner: bounded evidence/recovery hardening

## Source and scope

- Base inspected: `a06fbab645fb9f9b07909324e70166d563ce9f76` (`main`, 2026-10-21).
- Branch: `harden/mission3-placement-evidence`; the Draft PR records the final head and exact-head CI links.
- Improve the existing DWARF LOGIC **training placement** runner and receipt-loss reconciliation. No replacement runner, new identity, new Work lifecycle, new endpoint, or authority grant.
- Keep the existing Work Pass, HMAC rail, ownership, receipt fields and V1 placement writer. Canonical historical V1 records remain accepted; no new required receipt/pass fields are introduced.
- Keep bounded LOGIC registration. CODE and VISUAL remain unregistered (`UNKNOWN / MACHINE_NOT_REGISTERED`). Training placement completion is not production-work completion or qualification.

## Confirmed defects and change

1. Execution previously accepted same-key records with invalid schema/status/mode/actor or elevated/missing authority flags as `COMPLETE`. Recovery used a different, incomplete predicate.
2. Both paths now share one predicate: canonical V1 schema/state, exact Work/checkpoint/actor, LOGIC development-bench training, pending owner qualification, all five authority flags explicitly false, matching input evidence, exact durable record key, and a positive safe-integer record version.
3. Corrupt proof stays `UNKNOWN`, has no completion evidence, is not overwritten, and cannot create a recovered receipt. Recovery never invokes a machine.
4. A canonical older placement could previously cause recovery to mark an intake complete after execution was denied by scope or source SHA and receipt persistence failed. Reconstruction now preserves those same gates (`SCOPE_NOT_GRANTED` / `SHA_MISMATCH`).

## Red → green evidence (local only)

Commands were run before and after production edits, not inferred from code review:

| Check | Observed result |
| --- | --- |
| Unchanged base `npm test` | 94 tests, 94 pass |
| Placement corruption regression against base | 92 reported tests, 27 pass / 65 fail (includes failed parent tests); expected false `COMPLETE` and false `RECOVERED` assertions |
| Two additional reconstruction eligibility regressions before fix | 2 fail: `RECOVERED` rather than `UNKNOWN` |
| Preview binding regression before config | 1 fail: missing preview binding |
| Focused final placement/recovery regression | 94 tests, 94 pass |
| Local full-chain E2E | 4 tests, 4 pass |
| Final `npm test` | 194 tests, 194 pass, 0 fail |
| `npm run check`; `git diff --check` | pass |

Local Node: v24.19.0. Repository CI uses Node 22; its exact-head result must be checked separately. Node's discovery includes support modules in its reported total. Local npm prints a pre-existing environment `http-proxy` configuration warning; no test or syntax failure.

The full-chain test calls the actual Worker entry point, HMAC verifier, runtime, operator, bounded runner, production R2 **adapter**, and owner readback in one process. Its R2 bucket is an in-memory API-shaped fixture. No network fetch is used. All Work IDs, source labels, keys and receipts in these tests are synthetic/local. The existing `r2://factory/...` URI format in an assertion does **not** prove a real R2 write.

## Reliability test matrix

| Concern | Evidence and expected behavior | Limit |
| --- | --- | --- |
| Intake → dispatch → execution → receipt → owner readback | `runner-local-e2e.test.mjs`: signed preflight writes nothing; default runner persists training effect; receipt and owner readback correlate Work, checkpoint, pass and stored proof | Local fixtures; no production receipt or owner acceptance |
| Idempotency | Sequential identical intake returns original receipt, placement stays version 1; changed input under same Work/checkpoint returns conflict | Store must uphold advertised atomic compare-and-set |
| Duplicate dispatch | Eight concurrent retries while a runner is gated remain `UNKNOWN`, then converge on the single receipt; one execution | In-process concurrency, not a distributed load test |
| Retry | Existing `receive-idempotency` and operator tests; persisted claim prevents unsafe automatic replay | Default operator attempts remain 1; PR #18 owns configurable-budget/authority-retry hardening |
| Timeout | Simulated caller deadline while runner is blocked; retry is unreconciled and never replays; original can finish | No new server execution deadline or cancellation; a hung execution can remain unknown |
| Crash recovery | Existing receipt-loss tests plus new proof matrix: valid persisted effect reconstructs without execution; invalid/missing proof cannot | Missing proof or an already stored unknown receipt still requires owner review; no speculative effect replay |
| Unauthorized work | Invalid HMAC, stale timestamp, inactive/mismatched pass and transferred authority rejected before record writes; denied scope/SHA cannot become recovered completion | No credential, grant, or permission changes; no live unauthorized probes |
| Evidence integrity | Thirty corrupt-record cases exercise execution and recovery separately; all completion/return evidence is absent on unverified proof | V1 records are not cryptographically signed and do not store source SHA/pass-ref provenance; this is consistency validation, not new attestation |
| Compatibility | Historical canonical V1, explicit direct-runner actor, existing EXECUTE/import tests, LOGIC registration remain valid | No expansion into active production LOGIC or CODE/VISUAL providers |
| Source identity | Intake expected-SHA gate preserved during reconstruction; CI must match the Draft PR head | Mock source labels are not deployed source evidence |

## Known open work, deliberately not duplicated

- **Checkpoint follow-up:** this branch now returns the requested Work checkpoint from placement/import, validates Worker result correlation, and preserves kernel phase checkpoints separately from `workCheckpointId`. It includes the bounded checkpoint correction relevant to PR #31 without taking its removal of LOGIC training registration. PR #31 must be reconciled rather than merged blindly; its direct phase-to-Work comparison is incompatible with kernel runners.
- **PR #18** owns operator retry budget/error/authority isolation changes. Those concerns remain outside this independent patch; no claim that all configured retry policies are hardened.
- Existing persisted receipts are still authoritative; this patch does not add receipt-signing or retroactively rewrite old records.
- No GO Brain Factory execution, real Work dispatch, real owner receipt, merge, production deployment, or production storage write was performed for this work.

## Branch preview safety

GitHub `test.yml` runs syntax and tests for PRs with `contents: read`. `deploy.yml` runs only on pushes to `main` or explicit workflow dispatch; neither is used here. Existing Cloudflare Builds also creates branch previews.

The **only** staging-config addition copies the established PR #31 override:

```json
"previews": {
  "r2_buckets": [{ "binding": "RECORD_STORE", "bucket_name": "factory-district-preview" }]
}
```

The existing production binding remains `factory`. The preview bucket is shared staging, **not a new per-branch bucket**. No credentials, Cloudflare settings, permission grants or production bindings are changed. No preview dispatch or receipt creation is part of acceptance. After automatic preview build, inspect its exact deployment configuration read-only to verify the binding before any future use. A successful preview build alone is not proof of storage isolation or execution correctness.

## Acceptance and handoff

1. Check out the Draft PR's exact head; confirm the base and changed files. Do not merge or deploy.
2. Run `npm run check && npm test && git diff --check` using Node 22 (CI) or the reported local Node version.
3. Run the focused suites below and verify all corrupt proof cases fail closed, the canonical V1 path still succeeds, and recovery invokes no runner:

   ```sh
   node --test test/logic-placement-integrity.test.mjs test/logic-receipt-recovery.test.mjs
   node --test test/runner-local-e2e.test.mjs test/receive-idempotency.test.mjs test/preview-binding.test.mjs
   ```

4. Inspect GitHub `test` on the exact head, plus the independently reviewed source/tree. Record the CI URL and final conclusion in the Draft PR.
5. Verify the automatically built preview's exact commit and `RECORD_STORE` binding read-only. Do not send it work.
6. Resolve the separate checkpoint and configurable-retry work before claiming a general-purpose production runner is ready. BIG/owner approval remains necessary for merge, deployment and real execution.

## Review follow-up — Work checkpoint and intent integrity (2026-10-22)

The review reproduced two pre-existing false-completion cases at `6cecc383`:
(1) external checkpoint `WORK:CP-99` accepted with machine checkpoint `CP-05`;
(2) `logic_create` receiving only a training placement but `domainVerified: true`.

- Placement and Golden Case import now return the actual requested checkpoint.
- Worker completion requires matching Work ID and Work checkpoint. Kernel runs
  retain ingress correlation in `run.workCheckpointId`; `run.checkpointId` keeps
  its existing CP-01 through CP-04 lifecycle meaning. Simple/legacy runners may
  return the Work checkpoint directly in `run.checkpointId`. An explicitly null,
  missing-value or conflicting `workCheckpointId` cannot fall back to a phase.
- The bounded runner only performs placement for exact
  `PLACE_DWARF_LOGIC_TRAINEE`. Unsupported intents (including generic `EXECUTE`,
  `logic_create`, and Workbench training) remain UNKNOWN without placement
  reads/writes or completion evidence. Existing Golden Case import is retained.
- Existing LOGIC registration, V1 evidence validation, ownership, HMAC and
  receipt-loss recovery remain in place. No CODE/VISUAL providers are registered.

Validation: before implementation, 13/26 focused cases failed for the expected
checkpoint/false-completion behaviors. After implementation, full `npm test`
passes 205/205 locally. The full-chain fixture now uses `LOCAL-E2E:WORK-CP-99`
instead of CP-05. A real in-process kernel lifecycle reaches CP-04 while
preserving and persisting the external Work checkpoint through Worker readback.
These are local synthetic effects; latest-head CI and deployment are separate
checks. Retry hardening in #18, server execution timeout/cancellation, staging
source/bindings and real execution remain outside this follow-up acceptance.
