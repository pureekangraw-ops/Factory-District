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

## Metropolis ↔ Factory: baseline actor authority

The existing bilateral rail uses a timestamped **HMAC** request signature and
a server-held shared secret. Do not add OAuth refresh tokens to this internal
rail or place credentials inside handoff envelopes.

Factory verifies a City-issued active Work Pass for the exact Work ID,
Checkpoint ID, `handoff` action and `FACTORY_STATION` destination.
It accepts **any nonempty actor identity** carried by a valid Work Pass;
there is no GO-only allowlist in the Factory boundary.

City Hall stamps `actingActor` from its authenticated caller *after* its
normal authorization check. When the acting actor differs from the Work Pass
holder, City Hall must provide `cityAuthorization` under the HMAC-authenticated
rail request, describing an exact explicit Work grant (actor, Work ID,
Checkpoint ID, pass reference, action, station and operation). Factory rejects
absent, contradictory, wrong-scope or forged delegation claims.

The signing secret authenticates the **City rail sender**, not an arbitrary
Internet user. The city is the source of truth for who has which grant;
Factory checks command integrity and the supplied scope, rather than adding
another user permission system. New actors must first be onboarded and
authenticated at Metropolis; a nonempty actor name alone never gives access.

Receipts and readbacks preserve the actual `actingActor`, authorization
source (`WORK_PASS` or `EXPLICIT_WORK_GRANT`), Work and Checkpoint
correlation, and verification evidence. `BOUNDARY_HANDOFF` success is **not**
proof of successful CODE/VISUAL/LOGIC production.

The City must never pass through caller-supplied `actingActor` or
`cityAuthorization`; both fields are stamped from server-side authorization.
Old same-holder Work Pass traffic without `actingActor` stays compatible.
