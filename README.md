# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Current execution layers

1. Factory Station → Hall → PIXIE foundation
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation

## CODE Machinery

The first CODE machinery slice supports a common pipeline for Node/Web and Cloudflare Worker targets:

```text
Repo Inspector
  → Change Planner
  → Code Executor
  → Test Runner
  → Build Engine
  → Artifact Inspector
  → CI Checkpoint
  → Gate
  → Deploy
  → Runtime Verifier
  → Version Gate
  → CODE Return
```

The adapter contract is provider-neutral. It requires repository inspection, planning, execution, tests, build, artifact inspection, CI checkpoint, Gate, deploy, and runtime verification. Node/Web and Cloudflare Worker are target identities over the same contract.

### CODE safety rules

- Gate must pass before deploy is called.
- Build, artifact, deployment, and runtime records must preserve source SHA.
- Runtime SHA mismatch produces `UNKNOWN`; it cannot become `COMPLETE`.
- CI is a checkpoint, not completion.
- Deploy is not verified until runtime readback.
- Machine completion does not qualify the owner system.
- Credentials remain in provider/Port adapters and never enter the Work envelope.
- The current slice does not migrate engines from Ergasterion.

The CODE machinery uses the Machine Kernel and DurableStore boundaries. It does not create a second lifecycle or local state store.

```bash
npm test
npm run check
```
