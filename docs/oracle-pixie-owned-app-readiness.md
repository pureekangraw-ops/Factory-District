# Owned-app receiver readiness — Oracle / PIXIE (2026-10-08)

This is a **source/configuration inventory**, not a production connectivity certification. Main objective: ORACLE coordinates commands; PIXIE transports authorized instructions, artifacts and receipts; the owner app executes only operations it explicitly supports. Keep Metropolis Work/Checkpoint authority unchanged.

| Owned system | Existing ingress from source/config | Evidence | State |
| --- | --- | --- | --- |
| Metropolis | OAuth MCP, Work/Checkpoint grants, signed Factory Station adapter | \`src/stations/factory.mjs\` at pinned sender ref, deployed Worker binding names present | Existing; not an ORACLE dispatcher yet |
| Factory-District / PIXIE | Signed \`POST /station/receive\`, signed \`GET /station/readback/:receiptId\` | \`src/worker.mjs\`, \`src/rail-auth.mjs\`, this PR's offline action | **Interop offline PASS**; real owner-domain execution not proven |
| YGG METRO Shop | Worker has \`GO_HUB\` service binding and customer-intake/payment routes | \`yggmetro-web/src/index.js\`, Cloudflare binding metadata | Legacy bridge present; standardized PIXIE receiver not installed |
| GO Hub / Office | GO Hub Worker, work and bridge endpoints | \`prytaneion-workspace\`, Cloudflare binding metadata | Existing service; do not invent second authority |
| Observatory Web | Public GET map/health only; pins stored in browser localStorage | \`ygph-metropolis/observatory-web/worker.mjs\` | **NO server-side command receiver**; avoid claiming remote pin support |
| PRISM / Android | Android build/action and Observatory read-side integration | \`ygph-metropolis\` Android/PRISM modules | Device acceptance and command receiver not proven |
| GREENHOUSE | Static UI mock on main; Draft PR #2 adds server-side **read-only** Work adapter | \`Greenhouse\` and PR #2 | Offline adapter test; not a live command receiver |
| Ergasterion Legacy / PIXIE Lab | Workflow input \`request_id\` + \`command_json\` and legacy Factory Worker | \`Ergasterion-factory/.github/workflows/pixie-lab-v1.yml\` | Trigger defined, but historical production deploy failures; do not use as new authority |

## Action reachability as of this PR

- **PASS**: Factory-District PR-based test workflow (no deployment).
- **PASS**: Cross-repository Metropolis sender → Factory-District receiver offline Action (pinned source, test-only HMAC key and in-memory storage).
- **PASS**: Greenhouse Draft PR #2 agent and read-adapter CI (another repository, no production access).
- **EXISTS / NOT CALLED**: Ergasterion PIXIE Lab \`workflow_dispatch\`. Connected GitHub tools expose reruns/status and PR writes, but no generic new workflow-dispatch action.
- **SKIPPED**: Factory, Shop, Hub and Ergasterion production deploy Actions. These are real mutations and not safe connectivity probes.
- **UNKNOWN**: Live inter-app auth/receiver compatibility, ORACLE scheduling, PIXIE full data lifecycle, device results, end-to-end owner evidence.

## Integration acceptance gates (in order)

1. Discover existing owner-app ingress without changing authorities; inventory read operations separately from writes.
2. Define a common *description* of command, target capability, Work ID, Checkpoint ID, authorized grant, idempotency key, result and evidence. Reuse current Work Pass/transport rather than replacing it.
3. Enable receiver per owner app, default deny. Validate target identity and supported operation **at target**; do not expose unsafe public command endpoints. A \`CHECK\` call must not initiate execution if advertised read-only.
4. In review CI, test unknown operation denial, missing/expired authorization, replay rejection, unauthorized Work, receipt correlation and return evidence.
5. Obtain deliberate release authorization before merge/deploy, then verify each live target. Mark boundary acceptance, actual owner execution and device results independently.

## Notes
Offline signing and accepted receipt prove a boundary only. An accepted command is **not** proof of real domain execution; production Secret values were not read in this inventory. No OAuth, Work ownership, deployment settings or secret values changed in this PR.
