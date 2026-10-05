# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Phase 1 boundary

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

## Invariants

- Every system-to-system connection enters through the receiving Station or Port.
- No Rail may connect directly to an internal backend, agent, database, or owner domain.
- Factory Station is the Factory connection boundary.
- Factory Hall is the operational entry surface inside Factory. It is not a Board and is not a truth database.
- PIXIE is the Factory operator agent. PIXIE receives work, runs the appropriate Factory systems within granted authority, observes results, retries or performs RCA where allowed, gathers evidence, and reports the result.
- PIXIE does not become the owner of CODE, VISUAL, or LOGIC.
- CODE owns code.
- VISUAL owns visual.
- LOGIC owns logic.
- Cross-domain work uses an explicit handoff. Domains do not silently assume each other's authority.
- Operational truth remains with the responsible owner system. Missing evidence is UNKNOWN.
- Command success is not DONE. Completion requires the required verification/readback.
- Factory identity is singular. Do not create old/new/v1/v2 operational identities or compatibility aliases.
- Proven engines may be reused from older Factory implementations, but old architecture, routes, authority assumptions, boards, and naming are not inherited automatically.

## Phase 1 handoff envelope

A Factory handoff must be able to carry:

- Work ID
- Checkpoint ID
- source Station/Port
- target Station/Port or owner domain
- intent
- granted authority/scope
- input references
- evidence references
- result
- status
- receipt/readback

## Phase 1 runtime target

Cloudflare is the Factory runtime target. GitHub is used to build and repair Factory itself.

Required delivery chain:

```text
commit
  ↓
CI checkpoint
  ↓
Gate
  ↓
Cloudflare deploy
  ↓
runtime readback
  ↓
exact source SHA verification
```

Phase 1 must expose only the minimum runtime surfaces needed to prove the boundary: health, Factory Station receive/receipt, Factory Hall handoff, and readback. Do not migrate old Hub secrets, Board state, legacy ledgers, or unrelated integrations by default.

## Phase 1 acceptance

Prove three representative works (CODE, VISUAL, LOGIC) can travel:

```text
source Station
  → Rail
  → Factory Station
  → Factory Hall
  → PIXIE
  → correct owner domain
  → PIXIE result/evidence
  → receipt/readback
```

Also prove denied and unverifiable inputs fail closed and report DENIED or UNKNOWN rather than fabricating success.
