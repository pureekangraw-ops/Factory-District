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

The machine kernel provides a common execution contract before CODE, VISUAL, or LOGIC machinery is installed.

```text
RECEIVE
  → INTERPRET
  → EXECUTE
  → VERIFY
  → COMPLETE
  → RETURN
```

The kernel separates two axes:

- `executionState`: the execution lifecycle of this run.
- `returnState`: whether the result was delivered back.

A run may be `executionState: COMPLETE` while `returnState: FAILED` or `PENDING`. Return failure never rewinds completed execution.

Cancellation is explicit:

```text
EXECUTING / VERIFYING
        ↓ request cancel
CANCELLING
        ├─ verified stop evidence → CANCELLED
        └─ stop cannot be verified → UNKNOWN
```

Run completion does not claim subject maturity. In particular, a completed LOGIC experiment does not imply that the Logic or Agent is qualified. Qualification requires an Owner decision and evidence.

## Persistence boundary

The Machine Kernel requires a `PersistenceAdapter`. It does not own runtime state and does not create an in-process state store. The adapter contract covers:

- run creation and loading
- optimistic transition with `expectedSequence`
- attempt lineage
- heartbeat
- failure and cancellation records
- evidence
- Version Gate
- return records
- event and lineage reads

The current test suite uses an in-memory adapter only under `test/support/`. A durable vendor adapter is intentionally not selected in this phase.

## Invariants

- Every system-to-system connection enters through the receiving Station or Port.
- No Rail may connect directly to an internal backend, agent, database, or owner domain.
- Credentials never travel inside a handoff envelope.
- `HANDOFF_VERIFIED` is not `COMPLETE`.
- Cancellation must be verified; unverified cancellation is `UNKNOWN`.
- Execution completion and return delivery are independent states.
- MachineRun completion never implies subject/system maturity unless the Owner contract explicitly says so.
- Operational truth remains with the responsible owner system. Missing evidence is `UNKNOWN`.
- Proven engines from Ergasterion are not imported automatically.

## Current scope

This phase contains the execution kernel and persistence boundary only. It does not install CODE, VISUAL, or LOGIC machinery, choose D1/DO/R2, or claim autonomous PIXIE operation.

```bash
npm test
npm run check
```
