# Factory District

Factory District is the canonical home of the YGG METRO Factory.

## Current execution layers

1. Factory Station → Hall → PIXIE foundation
2. Universal Machine Foundation
3. Durable Run / Evidence boundary
4. CODE Machinery foundation
5. VISUAL Machinery foundation

## VISUAL Machinery

All first-round visual work uses one Machine Contract and one pipeline. The target menu selects the adapter; it does not create a separate lifecycle.

Supported targets:

- UI/Web
- Hero/Image
- Wallpaper
- Icon
- Presentation/Mockup

Supported modes:

- `MENU`
- `MANUAL`

Pipeline:

```text
Input Inspector
  → Visual Interpreter
  → Composition
  → Create/Edit
  → Render
  → Visual Inspector
  → Compare
  → Correction (when required)
  → Export
  → Final Output Verify
  → Version Gate
  → VISUAL Return
```

### VISUAL safety rules

- Rendered output is not approval.
- Compare failure must enter Correction or return a failure state.
- Final output must be verified before completion.
- Design/output version mismatch produces `UNKNOWN`, never `COMPLETE`.
- Visual evidence is scoped to the actual operation: render, inspection, comparison, correction, export, or final output.
- The pipeline uses the shared Machine Kernel and DurableStore boundaries.
- No visual engine is imported from Ergasterion in this phase.

```bash
npm test
npm run check
```
