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
