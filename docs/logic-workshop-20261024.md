# LOGIC Semi-Manual Workshop v0.1

Implementation for Draft PR #45; no merge/deployment or production acceptance.

## Canonical specification

- [GO Blueprint v0.1, Slack, 2026-10-24](https://yggmetro.slack.com/archives/C0CBTKBEJ4R/p1792818467150009)
- [GO implementation handoff, comment 6380200244](https://github.com/pureekangraw-ops/Factory-District/pull/45#issuecomment-6380200244)

These sources agree. Slack is the detailed canonical working design; the GitHub
comment summarizes it and confirms AGENT/RUNNER are subject kinds, not replacement
target enums. This is a newly issued design, superseding the earlier missing
Blueprint checkpoint. No material conflict remains.

## Implementation and semantics

`logic-workshop.mjs` implements REGISTER_SUBJECT, CAPTURE_BASELINE,
CREATE_CANDIDATE, RUN_TEST_SUITE, COMPARE_BASELINE, RECORD_RCA, OWNER_QUALIFY and
EXPORT_PACKAGE. AGENT and RUNNER share the same operations and storage model.
AGENT manifests carry role/prompt, capability and policy/authority refs. RUNNER
manifests carry workflow, step/tool and execution-policy refs. Existing
EXPERIMENT/AGENT_EVALUATION/SIMULATION target enums remain unchanged.

`logic-workshop-runner.mjs` adapts each manual operation to the existing Logic
Machine method lifecycle and durable Machine Kernel. Its lifecycle bookkeeping
is not evidence of simulation, training or qualification: operation details and
actual case results are stored separately. A test operation can COMPLETE while
its tests FAIL; this means the requested test suite was executed and recorded,
not that the subject passed. Machine subject assessment stays NOT_ASSESSED.

The entrypoint uses the existing dispatcher and `createConfiguredMachinery`.
Registration requires an injected deployment-owned `LOGIC_WORKSHOP_PROVIDER`
with `authorize` and `runCase` methods. No provider or binding is created by this
PR. An absent provider retains UNKNOWN generic readiness and the explicit
legacy-only readiness reason from the reviewed correction.

### Persistence

All new keys use `logic/workshop/v1/`, separate from DWARF and old Registry keys.
JSON content is canonicalized (sorted object keys), SHA-256 addressed and checked
on every read. Content is limited to 256 KiB per item. Explicit inline credential
fields are rejected; provisioning must supply nonsecret content only. This check
is not a general-purpose secret scanner.

Each subject uses a conditional-write aggregate containing immutable baseline,
candidate definitions, completed test runs, comparisons, RCA records, decisions,
packages and operation results. Aggregate CAS gives cross-entity consistency
without a second backend. Configs/digests/parents are never overwritten. Candidate
DRAFT status is its creation state; `snapshot().versionStates` derives current
DRAFT/TESTED/QUALIFIED/REJECTED from retained tests and explicit decisions. Packages
include the derived lifecycle. A later rejection prevents export against an old
approval. This separates immutable candidate identity from lifecycle decisions.

An initial baseline uses `initialImportedConfig: true` and `sourceVersionId:null`;
a later baseline may reference an existing source version with matching config.
A baseline TestRun uses `versionId:null`, explicitly representing the frozen
baseline config rather than inventing a candidate version. It must use that
baseline's suite and environment. Candidate tests reference an existing candidate
and its baseline. Test suite/environment changes are allowed for experiments,
but comparison returns NOT_COMPARABLE, null deltas/regressions, and cannot qualify.

Comparisons currently pair one baseline run and one candidate run; the stored
reference fields are arrays for compatibility. RCA requires existing non-PASS
results for its exact version. Adjustment is a separate CREATE_CANDIDATE with a
new ID, the failed parent and RCA ID. Retest is RUN_TEST_SUITE with a fresh run ID;
no self-editing or automatic RCA execution occurs.

Operation IDs are bound to command digest, Work ID, checkpoint and actor.
Identical replay returns the same result; changed replay conflicts. A persisted
pending claim prevents re-execution after an uncertain result. Test identity and
UNKNOWN status are persisted before case execution; completion replaces that
reservation once, retaining PASS/FAIL/ERROR results and evidence. Completed IDs
cannot be reused. Uncertain claims need evidence-based reconciliation; there is
no automatic unlock/retry. A subject with an uncertain effect remains blocked
rather than risking duplicate execution.

### Bounded execution and authorization

Existing signed station transport and Work Pass validation remain intact. The
Workshop runner requires `intent: LOGIC_WORKSHOP`, `EXECUTE:LOGIC` and exactly one
content-addressed command ref in `inputRefs`. The trusted provider must explicitly
authorize the command with matching subjectId, operation, operationId, actor and
ownerSystem. Test execution additionally requires `testInputsApproved:true`.
Qualification requires an ownerDecisionRef and an explicit qualificationApproved
boolean matching QUALIFIED/REJECTED; caller-supplied approval fields confer no
permission. QUALIFIED also requires comparable, passing candidate tests without
regressions. No production authority is granted.

Suites contain 1–64 unique case IDs and content-addressed input/expected refs.
Factory resolves those approved inputs and calls the configured `runCase` method;
it compares actual JSON to expected JSON independently, stores actual/expected
proofs and sanitizes provider exceptions into ERROR evidence. There is no eval,
model training, arbitrary URL fetch, fallback executor or paid service in this
implementation. Provider-side timeout, cancellation, isolation and cost policies
must be supplied and reviewed before any real provider is enabled; this PR's
synthetic provider proves the Workshop contract, not a sandbox for untrusted code.

### Package and receipt delivery

EXPORT_PACKAGE requires the latest explicit QUALIFIED decision for its version.
Its content-addressed JSON contains subject/manifest/config, candidate, baseline,
comparative tests/evidence, decision and Work/checkpoint binding. It never publishes
production. The normal Factory receipt references that artifact. Internal helper
`readWorkshopDelivery(store, receiptId)` verifies the stored receipt/readback,
artifact membership, digest and scope and returns the package plus exact Factory
receipt/readback. This avoids a circular hash from embedding a receipt in the
artifact it signs. It is not a public unauthenticated endpoint; callers retain
existing receipt authorization.

## Compatibility and unsupported integrations

DWARF placement/import intents, keys and receipts remain unchanged. Generic LOGIC
never falls back to DWARF. Health separately describes generic runner and legacy
capabilities while preserving aggregate READY for existing placement consumers.
CODE/VISUAL, HMAC, WorkID/checkpoint claims, receipt replay and GO/PANTHEON protocols
are unchanged. No GO or Observatory files were modified.

GO Direct still validates only DWARF placement. No generic GO Workshop API,
PANTHEON scope widening, production provider, model invocation, live training,
automatic publishing, merge/deploy or credential/configuration change is included.
The content/command ingestion helpers are internal APIs for the existing trusted
integration; no new public upload surface is introduced. Large/binary artifacts
and multi-run statistical comparison are outside this v0.1 implementation.

## Validation evidence

Local synthetic tests run both AGENT and RUNNER through signed Worker requests,
Machine Kernel, durable in-memory R2, receipt replay and exact readback. They cover
failed evidence, RCA-linked new candidate, qualification denial/approval, package
hash/readback, suite/environment mismatch, rejection, immutable IDs/digests,
wrong authority/scope, changed Work replay, corrupt content, empty suite, concurrent
claims and uncertain final persistence without replay. Old regression tests cover
DWARF, CODE/VISUAL, GO direct and PANTHEON.

Reproduce locally:

```sh
npm run check
npm test
node scripts/go-auth-probe-interop.mjs /path/to/Go-Together/worker/factory-direct.mjs
node scripts/go-logic-readiness-interop.mjs /path/to/Go-Together/worker/factory-direct.mjs
```

The GO module is verified against main `3dfd2d59f54d333e1236bd7c056efe4b213b44eb`.
Exact final test counts, commit and CI runs are reported in the PR handoff. These
are engineering/local integration results, not live B2E acceptance.
