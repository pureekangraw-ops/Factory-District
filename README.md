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

The default Worker registers CODE/VISUAL only when deployment-owned provider
bindings and valid target configuration are present. Without them, those domains
return `UNKNOWN / MACHINE_NOT_REGISTERED`. Bounded LOGIC training remains
registered. Health reports registration separately for each domain; READY alone
is not a live provider or execution verification. See
[configured CODE/VISUAL runners](docs/code-visual-runners.md) for the provider
contract, durable state and remaining staging acceptance. Only the explicit
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


## Delivery safety and replay reconciliation (2026-10-14)

The Station now atomically claims the Work ID + Checkpoint ID in the existing
R2 record store **before** invoking a domain runner. This is not a new credential
or permission mechanism. The HMAC rail and City-issued scoped Work Pass are
still required and are validated before claim.

- Identical resubmission returns the original durable receipt/readback without
  re-executing PIXIE or machinery. The sender can confirm using the signed
  `/station/readback/:receiptId` endpoint.
- Concurrent resubmission while the first execution is in flight returns
  `UNKNOWN / FACTORY_EFFECT_UNRECONCILED` with the existing receipt ID.
  Senders must reconcile with readback; they must not retry the effect.
- Reusing a Work ID + Checkpoint ID with a different operation/scope or actor
  is rejected as `FACTORY_WORK_SCOPE_CONFLICT` (HTTP 409).
- If execution completed but storage failed, the durable claim remains. It is
  intentionally **not** erased or automatically retried: manual reconciliation
  is required before any new execution could be considered.
- The result of boundary handoff is distinct from completed domain production.
  Health status for CODE/VISUAL/LOGIC must reflect actual registered runners;
  never declare an unregistered runner READY.

The existing rail secret is not rotated. WorkHub does not yet have the rail
credential, and this change does **not** bypass City Hall grants or expose a
public unsigned dispatch endpoint. Integration readiness must be separately
verified before enabling full WorkHub-to-Factory execution.

## Verified Pantheon WorkHub LOGIC handoff and recovery (2026-10-14)

Dedicated Pantheon HMAC rail is independent of City/Metro's existing secret.
The live scoped Work `task_be8f62ad42f3425baa29e3dbe7d6e3f2` completed
after recovering a missing receipt **from a persisted DWARF-01 LOGIC training-bench
record**, not by replaying the machine. Factory Work Pass and HMAC validation,
D1 receipt/evidence ledger and independent readback succeeded.

Proof: https://github.com/pureekangraw-ops/Factory-District/actions/runs/38504439559
Receipt: `receipt-a9327c1d-1856-4b27-b656-f8bae03dbe10`.

`POST /station/reconcile` is available only to the PANTHEON authenticated
principal and matching scoped LOGIC Work Pass. It reads a durable claim and
machine evidence, then recovers a missing receipt. No machine is invoked here;
absent or unverified effect remains UNKNOWN. The temporary CI smoke credential
was revoked and the single-use workflow retired. CODE/VISUAL are not production-ready.


## PIXIE recovery boundaries

PIXIE accepts a safe integer attempt budget of 1–10 (default 1). Thrown
AUTHORITY_DENIED, authorityBoundary, or AUTHORITY_DENIED class stops as BLOCKED,
even if retryable. Other exceptions expose only PIXIE_MACHINE_ERROR, never raw
messages or provider codes. Direct PIXIE handler exceptions use that same stable code.

Each attempt receives a fresh clone of baseline Work; caller state is preserved.
Uncloneable Work returns UNKNOWN / PIXIE_WORK_UNCLONEABLE without invoking a runner.
Conflicting supplied result Work, machine or domain identity remains UNKNOWN;
legacy omitted identity remains compatible, not full owner/evidence verification.
COMPLETE with a pending return remains UNKNOWN.

These are local control boundaries, not runtime Factory acceptance. Retry safety
still belongs to owner adapters. Existing uncertain-effect claims remain intact:
never clear a claim or replay an uncertain effect automatically. Recovery tests use
local in-memory mocks only; they do not execute the completed L1 task.
