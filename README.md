# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Phase 1 foundation

The runtime boundary is implemented as:

```text
METROPOLIS STATION
        ⇅
       RAIL
        ⇅
 FACTORY STATION
        ↓
   FACTORY HALL
        ↓
      PIXIE
   ┌────┼────┐
   ↓    ↓    ↓
 CODE VISUAL LOGIC
```

`HANDOFF_VERIFIED` proves only boundary delivery. It is not owner-domain completion.

## Phase 2 — Universal Machine Foundation

The machine kernel provides a common execution contract before CODE, VISUAL, or LOGIC machinery is installed. It separates `executionState` from `returnState`, verifies cancellation before `CANCELLED`, and requires a vendor-neutral `PersistenceAdapter`.

## Phase 2.1 — Durable Run / Evidence boundary

The runtime no longer creates an in-process receipt `Map`. Factory runtime commands require an injected `DurableStore` with explicit capabilities:

- durable records
- atomic compare-and-set writes
- append-only events
- read-after-write

The storage contract exposes only:

```text
get
put(key, value, expectedVersion)
append(stream, event)
list(stream)
```

The contract does not select D1, Durable Objects, R2, or another vendor. Storage choice follows data ownership, access pattern, consistency, retention, and artifact-size analysis.

### Record ownership

- Run, checkpoint, attempt, failure, cancellation and Version Gate records belong to the execution record store.
- Evidence metadata and lineage belong to the evidence record store.
- Large evidence/artifacts are referenced by `contentRef`; they are not copied into the run record.
- Owner operational truth remains with the Owner System.
- Factory stores execution evidence and readback, not a mirrored live Board.

### Consistency requirements

- Run transitions use optimistic `expectedVersion` / sequence checks.
- Events are append-only.
- Evidence references are read-after-write visible before a successful readback is returned.
- Duplicate writes are rejected or idempotent by record key.
- A storage conflict or unavailable store returns `UNKNOWN`; it never fabricates completion.

A test-only in-memory driver exists under `test/support/`. It is not a runtime fallback.

## Invariants

- Every system-to-system connection enters through the receiving Station or Port.
- No Rail may connect directly to an internal backend, agent, database, or owner domain.
- Credentials never travel inside a handoff envelope.
- `HANDOFF_VERIFIED` is not `COMPLETE`.
- Cancellation must be verified; unverified cancellation is `UNKNOWN`.
- Execution completion and return delivery are independent states.
- MachineRun completion never implies subject/system maturity unless the Owner contract explicitly says so.
- Operational truth remains with the responsible owner system. Missing evidence is `UNKNOWN`.
- Durable storage must be configured before command execution; no silent memory fallback.
- Proven engines from Ergasterion are not imported automatically.

## Current scope

The repository now contains the execution kernel and a vendor-neutral durable storage boundary. It does not yet select a production storage vendor, install CODE/VISUAL/LOGIC machinery, migrate Ergasterion, or claim autonomous PIXIE operation.

```bash
npm test
npm run check
```
