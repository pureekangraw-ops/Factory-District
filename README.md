# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Factory execution layers

1. Factory Station → Hall → PIXIE foundation
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation
5. VISUAL Machinery foundation
6. LOGIC Workspace + Health/Golden/Tracking
7. Bilateral Rail Link + Factory E2E
8. PIXIE Autonomous Lifecycle

## LOGIC Workspace

LOGIC uses the shared Machine Kernel but its run completion is not subject maturity or agent qualification.

```text
Design Bench
  → Build Bench
  → Development Bench
  → Simulation
  → Golden Case Vault
  → Evaluation
  → RCA (when required)
  → Agent Qualification
  → Versioning
  → LOGIC Return
```

Logic Registry, health history, and field results use the DurableStore boundary. Qualification remains an Owner decision.

## Bilateral Rail and PIXIE E2E

The Rail contract is bilateral:

```text
Station A ── Rail Link ── Station B
                 │
          one trust boundary
```

A link has exactly two endpoints. Transport failure, destination rejection, and readback failure remain distinct from internal Factory and PIXIE failures.

PIXIE selects a domain and machine, runs it through the shared lifecycle, observes the result, and returns evidence. GO/LIGHT do not drive individual machine steps; authority boundaries are the only escalation points.

## Invariants

- `HANDOFF_VERIFIED` is not `COMPLETE`.
- Cancellation must be verified; unverified cancellation is `UNKNOWN`.
- Execution completion and return delivery are independent.
- MachineRun completion never implies subject/system maturity unless the Owner contract explicitly says so.
- LOGIC run completion never implies Logic/Agent qualification.
- A bilateral Rail Link has exactly two Station endpoints and one trust boundary.
- Transport failure does not make Metropolis, Factory, or unrelated Stations unavailable.
- No legacy Ergasterion engine is imported automatically.

```bash
npm test
npm run check
```
