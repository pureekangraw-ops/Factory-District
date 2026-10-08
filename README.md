# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Worker readiness and execution

The deployed Worker uses R2 for receipts and readback. Wrangler's build command
embeds the checked-out Git commit from `WORKERS_CI_COMMIT_SHA`, `GITHUB_SHA`, or
`git rev-parse HEAD`. A Cloudflare version UUID is not a source commit.

`createFactoryWorker(env, { recordStore, domainRunners })` routes registered
CODE/VISUAL/LOGIC runners through DWARF-01 as the sole Factory Main Runner. Completed work
must preserve Work identity, return successfully, and carry machine evidence.
Machine output is persisted with the receipt and returned by Station readback.

The current worker entrypoint registers the active DWARF LOGIC worker (pending
qualification of current-system Golden Case replay). CODE and VISUAL provider
runners remain unregistered, so they return `UNKNOWN / MACHINE_NOT_REGISTERED`.
No simulated success is substituted for missing machinery.
Health reports readiness separately for each domain. Only the explicit
`LIVE_E2E_BOUNDARY_HANDOFF` intent exercises the boundary without executing a
domain; its `domainCompleted` remains false. This is not production machinery
acceptance.

## Current execution layers

1. Factory Station → Hall → DWARF main runner (PIXIE is Metropolis data circulation)
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation
5. VISUAL Machinery foundation
6. LOGIC Workspace + Health/Golden/Tracking
7. Bilateral Rail Link + Factory E2E
8. DWARF Autonomous Lifecycle
9. Production Integration Foundation

## Production Integration Foundation

The integration layer keeps provider credentials at a Port boundary and binds deployment to runtime readback:

```text
Provider Port
  → capability evidence
  → Bilateral Rail
  → Factory Station
  → DWARF / Machine
  → receipt/readback
  → source SHA
  → deployment
  → destination
  → runtime SHA + health
```

The Factory runner accepts a valid GO or LIGHT Work Pass when the Work and
Checkpoint identity, station grant, and authority boundaries match. A connected
agent is not by itself authorized to execute a different Work.

PIXIE rotates and reconciles data/report/evidence in Metropolis. Historical
`pixie` response and `pixieResult` record fields are retained as read-only
compatibility aliases while consumers migrate to `dwarf` / `dwarfResult`.
These aliases do not execute machinery.

A runtime is not verified merely because deployment returned an accepted response. Source SHA, deployment reference, destination and runtime readback must match. Any missing or mismatched evidence is `UNKNOWN`.

Provider credentials are references held by the Port. They never enter the Work envelope or Rail payload.

This phase defines the provider-neutral integration contract and tests. It does not select a production vendor, inject real credentials, or deploy to a live destination.

```bash
npm test
npm run check
```
