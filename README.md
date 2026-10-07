# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Worker readiness and execution

The deployed Worker uses R2 for receipts and readback. Wrangler's build command
embeds the checked-out Git commit from `WORKERS_CI_COMMIT_SHA`, `GITHUB_SHA`, or
`git rev-parse HEAD`. A Cloudflare version UUID is not a source commit.

`createFactoryWorker(env, { recordStore, domainRunners })` routes registered
CODE/VISUAL/LOGIC runners through the existing PIXIE operator. Completed work
must preserve Work identity, return successfully, and carry machine evidence.
Machine output is persisted with the receipt and returned by Station readback.

Production provider runners are not registered in the default Worker entrypoint.
Operational execution therefore returns `UNKNOWN / MACHINE_NOT_REGISTERED`.
Health reports readiness separately for each domain. Only the explicit
`LIVE_E2E_BOUNDARY_HANDOFF` intent exercises the boundary without executing a
domain; its `domainCompleted` remains false. This is not production machinery
acceptance.

## Current execution layers

1. Factory Station → Hall → PIXIE foundation
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation
5. VISUAL Machinery foundation
6. LOGIC Workspace + Health/Golden/Tracking
7. Bilateral Rail Link + Factory E2E
8. PIXIE Autonomous Lifecycle
9. Production Integration Foundation

## Production Integration Foundation

The integration layer keeps provider credentials at a Port boundary and binds deployment to runtime readback:

```text
Provider Port
  → capability evidence
  → Bilateral Rail
  → Factory Station
  → PIXIE / Machine
  → receipt/readback
  → source SHA
  → deployment
  → destination
  → runtime SHA + health
```

A runtime is not verified merely because deployment returned an accepted response. Source SHA, deployment reference, destination and runtime readback must match. Any missing or mismatched evidence is `UNKNOWN`.

Provider credentials are references held by the Port. They never enter the Work envelope or Rail payload.

This phase defines the provider-neutral integration contract and tests. It does not select a production vendor, inject real credentials, or deploy to a live destination.

```bash
npm test
npm run check
```

## PIXIE recovery boundaries

PIXIE accepts an integer attempt budget from 1 through 10 (default 1). Thrown
`AUTHORITY_DENIED`, an authority-boundary flag, or authority-denied failure class
stops the cycle as BLOCKED, even when marked retryable. Other exceptions produce
an UNKNOWN result with a stable error code rather than raw provider messages.
Each attempt receives a fresh copy of the original Work payload, preserving
caller state and preventing one attempt from contaminating the next.

A completed returned machine result with conflicting Work, machine or domain
identity stays UNKNOWN. Legacy runners that omit identity remain compatible;
this check alone is not full owner identity/evidence verification. Retryable
errors still require owner adapters to ensure replay is safe; this change does
not add idempotency or automatic rollback.

`test/pixie-recovery.test.mjs` covers these recovery drills alongside the existing
operator tests. They test deterministic control logic, not model training or
production execution. No provider credentials, machine registrations, merge or
deployment are changed.
