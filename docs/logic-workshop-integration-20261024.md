# Bounded Workshop direct integration

Continuation of merged Factory PR45 (`200c7317`), GO base `3dfd2d59`.
This is a review candidate, not a deployment or live acceptance result.

## Existing architecture reused

- Existing owner-authenticated GO MCP and dedicated signed Factory service rail.
- Existing `factory-machinery` Worker, `CodeProvider` RPC entrypoint and
  `CODE_PROVIDER` binding. Two additional RPC methods (`workshopAuthorize`,
  `workshopRunCase`) reuse that connection. No new service, binding, credential,
  permission setting, browser action or provider subscription.
- Existing R2 store, Logic Machine lifecycle, Machine Kernel, Factory claims,
  receipts and scoped artifact retrieval. DWARF/CODE/VISUAL and PANTHEON unchanged.

Why: the integration gap was transport and an executor, not another backend.
Reusing the already deployed service avoids expanding resource access. Although
hosted on CodeProvider's existing RPC entrypoint, these operations use the LOGIC
Workshop lifecycle and subject kinds; they do not invoke CODE execution.

## Supported execution

AGENT adapter `RULE_AGENT_V1` is a deterministic advisory rule evaluator, not an
LLM. Manifest prompt declares `mode: RULE_BASED`; policy specifies allowed input
fields and 1–16 maximum rules; authority declares `ADVISORY_ONLY` and no tools.
Rules have `{field, contains, output}` and select the first matching literal text
substring, otherwise `defaultOutput`. Provider/model refs and tool capabilities
are rejected by this adapter. All rules are validated before matching. Actual
output is independently compared to the suite expectation by Workshop.

RUNNER adapter `PIPELINE_RUNNER_V1` executes 1–16 arithmetic steps on numeric input
`{value}`. Steps are `{op: ADD|MULTIPLY, value}` and must be allowed by the immutable
manifest workflow graph. Constants are finite and bounded to ±1,000,000; results
are finite and bounded to ±1e12. No tool refs, eval, arbitrary code, network access,
model invocation, paid external calls or autonomous changes are implemented.
Unsupported adapters become retained ERROR test results, never a substitute PASS.

## Transport and application authorization

New owner-approved GO tool `factory_workshop_content` takes nonsecret JSON content
and returns a SHA-256-addressed ref. It calls `/station/go-workshop-content` on the
existing signed GO rail, restricted to GO, current expected source SHA and 64 KiB.
Identical content is idempotent. GO independently recomputes canonical content hash.
The existing explicit credential-field rejection remains; callers must supply
synthetic/nonsecret inputs, not rely on that check as a universal secret scanner.

Existing `factory_direct_submit` accepts LOGIC `spec: {workshop: command}`. The
command uses the exact Blueprint operations from PR45. All content/config/schema
fields are the refs/hashes returned by ingestion. `REGISTER_SUBJECT.ownerSystem`
is `go-together`. `OWNER_QUALIFY` additionally requires an explicit QUALIFIED or
REJECTED decision and ownerDecisionRef; MCP still requires authenticated owner
and `approved: true`. No caller Work Pass or credential is accepted.

After GO HMAC/source checks, Factory persists the command and a create-only grant
bound to its Job/Work/checkpoint, command hash/ref, subject, operation and actor.
The provider independently reads this grant from existing storage. Matching plain
actor/source labels or a fabricated approval in an ordinary City handoff do not
create a grant. Changed request content conflicts before execution. Existing
claims prevent duplicate operation execution; use `factory_direct_job_status`
with the original requestId after an uncertain submit. No automatic resubmission.

GO status exposes `workshopReady` from registered generic runner readiness. Old
Factory versions lack it, so new GO refuses Workshop writes before activation.
Registration is not execution proof; old provider/new Factory mismatch must still
be avoided by the reviewed release sequence.

## Return and package

GO returns `LOGIC_WORKSHOP_COMPLETED` with the actual operation result, not
`LOGIC_TRAINING_PLACED`. A completed test operation may report FAIL/ERROR tests;
only the operation was completed. Failed qualification/export returns the actual
failure with receipt/request identity and can be read back without re-execution.

For EXPORT_PACKAGE, existing `/station/go-artifact` accepts only a content ref
bound to that GO-owned verified receipt. It returns the immutable package plus
exact persisted receipt/readback from `readWorkshopDelivery`. GO verifies the
transport byte hash, receipt/source headers, package content hash and Work/checkpoint
binding before returning JSON bytes as base64. No arbitrary content-store download
or public package endpoint was added. Output size is limited to 512 KiB.

## Evidence and release boundary

Local `test/workshop-direct.test.mjs` uses the real constrained provider with signed
Worker requests and in-memory R2. Both AGENT and RUNNER perform registration,
baseline capture, failed baseline/candidate tests, RCA, adjusted candidate, passing
test, comparison, approval, later rejection, denied old-approval export, reapproval
and successful package/readback. Each operation is replayed with the same request
ID and returns the same receipt/result. Agent actual output is `high`; Runner
actual output is `4`. Neither is supplied by a canned provider PASS.

`node scripts/go-workshop-interop.mjs /path/to/GO/worker/factory-direct.mjs` exercises
the actual paired GO client through that same Factory/provider stack. It verifies
both 14-operation flows, content/package hashes, receipt readback and request-ID
reconciliation. Printed IDs are local fixtures, not live jobs.

Negative coverage: City content upload, stale source, credential field, missing
owner decision, forged provider authorization, changed request, unauthorized
content download, unsupported arbitrary-code adapters, old-runtime readiness,
MCP owner/approval/extra-field checks and independently mismatched content digest.

Review both repository candidates before release. Safe sequencing: GO adapter
first (Workshop remains disabled against old Factory), then the existing Factory
main-push workflow deploys provider before Factory. Preserve GO assets and all
current bindings, especially GOVIEW/Observatory. No config changes are needed.
Rollback versions must be recorded again at activation. Live acceptance requires
new bounded synthetic Work IDs after the reviewed code is deployed; no live jobs
were run during this implementation.

## Schema enforcement correction

Subject and step schema refs are executable contracts, not metadata. Supported
schemas require exactly one type: object, array, string, number, integer, boolean
or null. Object schemas additionally support properties, required and boolean
additionalProperties (default true); array schemas require a supported items
schema. Schema nesting is limited to eight levels and object properties/required
lists to 32 entries. Integers must be safe integers; numbers must be finite.
Boolean schemas, missing/union types, refs, patterns, combinators, numeric/string
constraints and all other keywords are explicitly rejected with
WORKSHOP_SCHEMA_UNSUPPORTED rather than silently ignored. No type coercion occurs.

Registration validates this subset. Before each test executor call, input and
expected output are checked against the stored subject schemas. Actual output is
checked before PASS/FAIL comparison; a mismatch is retained as ERROR with a specific
input/expected-output/output schema reason. Comparison, qualification and export
also revalidate schemas against stored input/expected/actual evidence, so old or
inconsistent proof cannot qualify merely because actual equals expected.

Fixtures now declare actual intended contracts: Agent input {text:string} and
output string; Runner input {value:number} and output number. Local syntax checks,
308/308 Factory tests and the paired GO Agent/Runner flows pass. GO candidate is
unchanged at c2a984e790e877c0111ea8adf7970e96b1f07a47. No deployment or live test.
