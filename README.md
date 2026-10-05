# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Current execution layers

1. Factory Station → Hall → PIXIE foundation
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation
5. VISUAL Machinery foundation
6. LOGIC Workspace + Health/Golden/Tracking
7. Bilateral Rail Link + Factory E2E
8. PIXIE Autonomous Lifecycle

## PIXIE Autonomous Lifecycle

PIXIE now owns orchestration across the domain machines without becoming their operational truth owner:

```text
RECEIVE
  → SELECT DOMAIN + MACHINE
  → EXECUTE
  → OBSERVE
  → RECOVER / RETRY within budget
  → VERIFY
  → RETURN
```

PIXIE stops at an authority boundary and returns `BLOCKED`. An unverified machine result returns `UNKNOWN`. GO/LIGHT do not drive individual machine steps.

## Factory E2E

The tested path is:

```text
Metropolis Station
  → Bilateral Rail Link
  → Factory Station
  → PIXIE
  → selected machine
  → result
  → receipt/readback
```

The Rail Link has exactly two Station endpoints and one trust boundary. Transport failure, destination failure, machine failure, authority block, and readback failure remain distinct outcomes.

## Invariants

- `HANDOFF_VERIFIED` is not `COMPLETE`.
- Cancellation must be verified; unverified cancellation is `UNKNOWN`.
- Execution completion and return delivery are independent.
- MachineRun completion never implies subject/system maturity unless the Owner contract explicitly says so.
- LOGIC run completion never implies Logic/Agent qualification.
- A bilateral Rail Link has exactly two Station endpoints and one trust boundary.
- PIXIE may retry only within the machine budget and authority.
- PIXIE does not merge, deploy, qualify, or change Owner authority by itself.
- No legacy Ergasterion engine is imported automatically.

```bash
npm test
npm run check
```
