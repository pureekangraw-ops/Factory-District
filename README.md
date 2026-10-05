# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Phase 1 foundation

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

The first runtime slice proves the receiving boundary and handoff path. It does not claim that CODE, VISUAL, or LOGIC work is complete.

## Runtime surfaces

- `GET /health` returns `status`, `sourceSha`, `runtimeSha`, and `observedAt`.
- `POST /station/receive` accepts a Factory handoff at the Factory Station and routes it internally through Factory Hall and PIXIE.
- `GET /station/readback/:receiptId` returns live receipt/readback state and evidence.
- The foundation worker can be deployed to Cloudflare with `SOURCE_SHA` or `COMMIT_SHA` set to the deployed commit.

## Invariants

- Every system-to-system connection enters through the receiving Station or Port.
- No Rail may connect directly to an internal backend, agent, database, or owner domain.
- Factory Station is the Factory connection boundary.
- Factory Hall is the operational entry surface inside Factory. It is not a Board and is not a truth database.
- PIXIE is the Factory operator agent. PIXIE receives work, runs the appropriate Factory systems within granted authority, observes results, retries or performs RCA where allowed, gathers evidence, and reports the result.
- PIXIE does not become the owner of CODE, VISUAL, or LOGIC.
- CODE owns code. VISUAL owns visual. LOGIC owns logic.
- Cross-domain work uses an explicit handoff. Domains do not silently assume each other's authority.
- Operational truth remains with the responsible owner system. Missing evidence is UNKNOWN.
- Command success is not DONE. Completion requires the required verification/readback.
- Credentials never travel inside a handoff envelope.
- Factory identity is singular. Do not create old/new/v1/v2 operational identities or compatibility aliases.
- Proven engines may be reused from older Factory implementations, but old architecture, routes, authority assumptions, boards, and naming are not inherited automatically.

## Phase 1 acceptance

The automated tests prove three representative handoffs travel through the foundation path:

```text
source Station
  → Rail boundary
  → Factory Station
  → Factory Hall
  → PIXIE
  → correct owner domain
  → PIXIE result/evidence
  → receipt/readback
```

They also prove denied scope, unavailable destination, source-SHA mismatch, and receipt-versus-completion behavior fail closed. The foundation verification is a boundary handoff verification, not a claim that domain work is DONE.

```bash
npm test
npm run check
```
