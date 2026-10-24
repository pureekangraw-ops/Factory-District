# LOGIC Workshop implementation checkpoint

Status: partial implementation; draft only. No merge, deployment or live jobs.

## Source and Blueprint recovery

Factory base: `2a12d793d8c0546dcea9d54d1a8dfcc3f4677b38`.
GO remote main: `3dfd2d59f54d333e1236bd7c056efe4b213b44eb`.
The owner request of 2026-10-24 calls for a separate LOGIC Workshop supporting
Agent and Runner, persistent Baseline/Version/Test Results and existing Machine
Foundation integration, while preserving DWARF placement.

Recovered sources:

| Source | Established contract | Missing Workshop decision |
| --- | --- | --- |
| GO Brain PLAN `8190e902-e625-44a9-b16f-10162eda0dd5` | Supported capability, real execution, artifact, durable receipt and exact readback are separate facts | No Agent/Runner or Baseline schema |
| GO Brain architecture `aedaeca2-3251-4677-ba00-300da0897f57` | Work identity and owner authority; tool completion differs from validated completion | No Workshop contract |
| `src/logic-contract.mjs`, `logic-adapters.mjs`, `logic-machine.mjs` | EXPERIMENT, AGENT_EVALUATION, SIMULATION; design/build/development/simulation/golden/evaluation/RCA/qualification/version lifecycle | No RUNNER target or Agent-versus-Runner semantics |
| `src/logic-registry.mjs` | Registration with version/manifest; health and field-result history | No Baseline, per-version lineage or test-result storage contract |
| `src/machine-contract.mjs`, `machine-kernel.mjs`, `durable-machine-persistence.mjs` | Machine run/attempt/evidence/verification/return persistence; independent subject assessment and ingress checkpoint | These are reusable infrastructure, not definitions of Workshop subjects |
| `src/dwarf-logic-trainee.mjs` | Explicit placement, unchanged trainee key, pending qualification and false authority flags; legacy golden-case import | Placement does not execute reasoning or training |

GO Brain lexical searches for Blueprint, LOGIC Workshop, Machine Foundation,
Baseline and Runner, repository documentation scans, and GitHub Blueprint search
in Factory-District and Go-Together did not locate the canonical Workshop design.
Historical unmerged DWARF branches are not treated as the current Blueprint.

The material blocker is the missing canonical Blueprint record/file and revision.
It must establish the Agent/Runner input/output/provider contracts, what is frozen
as a Baseline, how candidate/version identities relate to it, and which test
results belong to each version (including failed runs). These decisions affect
durable schemas and execution effects; this PR deliberately does not invent them.

## Implemented and supported

`createLogicDispatcher` separates explicit legacy DWARF intents from the default
LOGIC executor. The production entrypoint now composes that dispatcher around
the existing machinery configuration instead of overwriting LOGIC with DWARF.
An injected LOGIC runner receives the exact original input and returns its result
unchanged. Runner exceptions never fall back to placement.

Explicit `PLACE_DWARF_LOGIC_TRAINEE` and legacy `IMPORT_GOLDEN_CASES` retain their
implementation, records, idempotency and receipt semantics. Generic LOGIC with
no configured runner returns UNKNOWN / `LOGIC_RUNNER_NOT_CONFIGURED`, with no
verification or placement evidence. Wrong-domain input invokes neither runner.

Why this change: DWARF was installed as the default LOGIC executor in the Worker
entrypoint. An explicit dispatcher is the smallest change that separates that
capability while preserving existing rails and providing a place for the actual
Workshop runner once its contract is recovered. No new backend, route, permission
gate, provider binding or authentication behavior is introduced.

Compatibility: unsupported LOGIC diagnostic changes from
`DWARF_LOGIC_INTENT_NOT_SUPPORTED` to `LOGIC_RUNNER_NOT_CONFIGURED` at the default
Worker entrypoint. Direct users of the DWARF runner retain its old diagnostic.
GO direct still accepts only its existing LOGIC placement spec; PANTHEON scope
validation is unchanged. Existing health READY remains registration information,
not evidence of generic reasoning/training capability.

Readiness review correction: the dispatcher's aggregate LOGIC status stays READY
for existing GO placement consumers, with reason `LOGIC_LEGACY_CAPABILITIES_ONLY`
when no generic runner exists. Health separately exposes
`genericRunner: {status: UNKNOWN, reason: LOGIC_RUNNER_NOT_CONFIGURED}` and explicit
READY capability entries for placement/import. A configured generic runner has
its own READY registration status; that still does not prove execution success.
Worker regressions verify health makes no writes, absent generic execution fails,
and explicit placement with receipt readback succeeds.

## Validation

All execution was local with synthetic fixtures and in-memory storage.

- `npm run check`: PASS.
- `npm test`: PASS, 276 tests, zero failures.
- Six new dispatcher regressions cover placement persistence/idempotency,
  separate runner dispatch, missing runner, wrong domain, legacy import and
  exception without fallback.
- Two new signed Worker integration regressions cover generic LOGIC rejection
  and legacy placement with duplicate receipt identity and exact readback.
- Existing full-suite CODE/VISUAL, GO direct and PANTHEON tests pass.
- `node scripts/go-auth-probe-interop.mjs /workspace/go-factory-room2/worker/factory-direct.mjs`:
  PASS, offline paired protocol probe with zero writes/executions. GO module
  compared equal to current main `3dfd2d59` before running.
- `node scripts/go-logic-readiness-interop.mjs /workspace/go-factory-room2/worker/factory-direct.mjs`:
  PASS, current GO consumer accepts the scoped readiness and completes synthetic
  placement with a verified receipt against the default Worker and in-memory
  bucket. No remote calls or real jobs.
- First full-suite run found four expected old diagnostic assertions. Updated
  those assertions to the new entrypoint diagnostic; all other assertions were
  preserved and the full suite passed on rerun.

## Remaining work and boundaries

Agent/Runner Workshop operations, Baseline/Version/Test Results persistence and
their Machine Foundation integration are pending the canonical contract. They
are **not implemented or proven by this partial PR**. No new GO adapter is
required for the routing separation; any later Workshop adapter must follow the
recovered contract. No GO/Observatory files were edited.

No live jobs, training, customer data, model/provider calls, production writes,
credential changes, merge or deployment were performed. Prior CODE/VISUAL live
proofs remain historical, unchanged, and were not rerun for this work.
