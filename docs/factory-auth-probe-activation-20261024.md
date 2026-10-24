# Factory direct authentication continuation — 2026-10-24

## Recovered goal and evidence

PLAN `8190e902-e625-44a9-b16f-10162eda0dd5` revision 1: owner intent → supported capability → authenticated existing dispatch → execution → artifact → durable receipt → exact readback. Preserve legacy PANTHEON paths and TaskIDs. CODE is bounded Worker JS; VISUAL is static card PNG; LOGIC is DWARF training only.

Release `f3b865cd-b4a3-452b-b5d5-b6f512802449` revision 8 contains stale placeholder claims. The owner reports replacing keys. Actual values and matching remain unknown; this work never reads them.

Freshly verified:
- Factory PR 43 merged at `46991ea8a0b5c6e1d0a4e7ef9c2bf1910a7f9e21`; GO PR 12 merged at `45fad4df8c2b886f5b703e56a38f661b25f9e3bd`.
- Existing Factory auth branch fetched at `fc65efba4655e1f94db837a43957f1b8918f48fb`; GO counterpart fetched at `b20181e0fa478d21411a6ce3d18631e463764cab`.
- Native read-only Factory status reports Factory source `46991ea8a0b5c6e1d0a4e7ef9c2bf1910a7f9e21`, runtime/machinery READY, commandReady false, old `PENDING_OWNER_REPLACEMENT` label. That label is not evidence of the actual secret contents or matching.
- Auth-probe changes are absent from the reported Factory runtime. No live matching-key proof was obtained.
- Cloudflare metadata via GO helper returned `CLOUDFLARE_NOT_CONFIGURED`; public GO health fetch returned HTTP 403. Neither proves a Factory credential error.

## Why this?

Actual problem: old validation assumes hex encoding, while owner-generated opaque HMAC keys may use other encodings. Existing candidate branches add a read-only authenticated challenge to distinguish format, mismatch, and missing runtime. Factory additionally trimmed its GO key before validation, contradicting its raw-byte validator and GO sender.

Goal fit: establish authenticated existing dispatch without creating jobs just to test credentials. Simplest existing option: preserve the existing binding, HMAC request envelope, source identity and scoped routes. No new architecture or permission gate.

Regression risk: accepting opaque keys changes GO format validation; signed requests still require matching HMAC and timestamp. GO secrets with outer whitespace now fail closed consistently. Legacy CITY/PANTHEON normalization is unchanged. Existing regression suite covers their routes.

## Verification and separate stages

- `npm run check`: pass.
- `npm test`: 268 passed, zero failures.
- `node scripts/go-auth-probe-interop.mjs /path/to/extracted/GO/worker/factory-direct.mjs`: pass against GO commit `b20181e0fa478d21411a6ce3d18631e463764cab`. Matching synthetic opaque key, mismatch, missing runtime route and sanitized response tested; zero writes and zero machine calls.
- Unit probe tests verify zero durable put/append calls and zero execution, including rejection of trimmed-key configurations.
- These are offline engineering checks, not real CODE/VISUAL/LOGIC acceptance.
- Queue: no live queue action. Execution: none. Artifact: none newly produced. Receipt: none newly produced. Historical L1 receipt/report is not new execution proof.

## Exact activation request for parent/owner

After separate reviewer acceptance, authorize merge and deployment of the reviewed Factory auth-probe PR and the coordinated GO auth-probe integration (currently `b20181e0fa478d21411a6ce3d18631e463764cab`; parent must resolve ownership with Observatory PR 13 before changing worker/index.js). Recheck final paired heads before activation. Factory main push automatically deploys Factory and its existing provider via the existing workflow; GO requires its existing deployment path. Preserve existing bindings, storage, assets, and secret values.

Then authorize only owner-authenticated `factory_direct_auth_probe` and `factory_direct_status` read-only calls. Verify deployed source identities and authenticated nonce proof. A 404 means missing probe route, a rejected signature means authentication failed, and format rejection alone cannot prove mismatch. Do not request key rotation based only on labels.

This room does not merge, deploy, configure secrets, change access, purchase resources, or run production jobs. A later real execution request must identify one supported bounded CODE/VISUAL/LOGIC spec and approve that execution. Only after that scope is confirmed may a new requestId be submitted; retain it for status recovery, then verify receipt and artifact independently, with repeated readback and no replay of uncertain dispatch.

## GO integration notes for parent

No GO files or Observatory branch were modified. Two diagnostic edge cases in GO candidate deserve separate owner integration review: all upstream 503s currently map to key-not-configured although Factory can also return storage-not-configured; and a successful probe with a source SHA different from health leaves authStatus AUTHENTICATED while commandReady is false. Keep runtime/configuration errors distinct from credential errors when integrating.
