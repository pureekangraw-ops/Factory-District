# Configured CODE / VISUAL runners

This change connects the existing CODE and VISUAL machine pipelines to the
Worker's existing PIXIE dispatch, R2 record store and receipt/readback boundary.
It depends on PR #40's Work-checkpoint correlation and LOGIC integrity fixes.
It does not provision or select a provider, change Wrangler bindings, or deploy.

## Deployment-owned provider contract

| Domain | Binding | Server configuration | Accepted intent | Required scope |
| --- | --- | --- | --- | --- |
| CODE | CODE_PROVIDER | CODE_TARGET: NODE_WEB or CLOUDFLARE_WORKER | EXECUTE_CODE | EXECUTE:CODE and DEPLOY:CODE |
| VISUAL | VISUAL_PROVIDER | VISUAL_TARGET: UI_WEB, HERO_IMAGE, WALLPAPER, ICON, or PRESENTATION_MOCKUP; VISUAL_MODE: MENU (default) or MANUAL | EXECUTE_VISUAL | EXECUTE:VISUAL |

Bindings are trusted RPC/service objects implementing the existing
CODE_ADAPTER_METHODS / VISUAL_ADAPTER_METHODS, not arbitrary request URLs.
Provider credentials stay in the provider's server environment. The binding and
its target are deployment-owned; a Work cannot select a different binding.
Providers must enforce their own repository, destination, artifact and spending
policies. The added DEPLOY:CODE scope check grants no permissions by itself.
It prevents generic execute scope from authorizing the existing deploy step.

The authenticated Work must supply nonempty string inputRefs to the owner's
brief/repository/design records. The provider resolves those refs using its own
access. There is no new public unsigned dispatch route or credential field.
Existing HMAC, Work Pass, actor checks and durable delivery claims are retained.

Provider methods receive the existing per-step context including work/run.
CODE implements inspectRepository, planChange, executeChange, runTests, build,
inspectArtifact, ciCheckpoint, deploy, verifyRuntime. VISUAL implements
inspectInput, interpretDesign, compose, createOrEdit, render, inspectVisual,
compare, correct, exportOutput, verifyFinalOutput. Return the existing step
status and evidence fields; do not return credentials. No fixture provider is
included in production source and no default successful result is fabricated.

A missing/incomplete provider or invalid target stays unregistered UNKNOWN.
Health READY means the configured runner is registered; it is not a provider
connectivity test or acceptance of any real job. LOGIC training remains present.

## Persistence and completion

Machine state lives at records/machine/runs/<runId> in the existing RECORD_STORE
bucket. Each run, its evidence, attempts, verifications, returns and audit events
share one versioned CAS-protected aggregate. Transition and audit are atomic;
conflicting writes fail instead of retrying an external effect. Separate adapter
instances can read the same persisted state. The internal CP-01 through CP-04
lifecycle stays separate from the ingress workCheckpointId.

CODE requires nonempty source identity from repository/build/artifact/deploy,
artifact and deployment references, then matching runtime SHA. Failed CI stops
deployment. READY/ACCEPTED are not executed-step success; only repository
inspection may use READY. VISUAL requires a design version and an exported output reference,
then verifies the final design version. Missing identity/output never completes.
Persisted return resultRefs propagate into the existing owner artifact readback.
Provider exceptions are reduced to stable codes; raw exception text is excluded.

The delivery claim precedes all provider work. An identical duplicate reads the
prior receipt. If the receipt is lost after a machine effect, replay remains
UNKNOWN / FACTORY_EFFECT_UNRECONCILED and does not invoke providers again.
CODE/VISUAL automatic receipt reconstruction is deliberately not added: operator
review of the persisted run and effect is required before any retry decision.

## Verification and remaining live boundary

Tests exercise the actual default Worker, signed rail ingress, existing machine
pipelines, production persistence adapter, R2-shaped local bucket, receipts and
owner readback. Provider operations are synthetic test functions, not actual
build/deploy/render operations. The durable adapter also runs the kernel's
transition, cancellation, qualification and return contract scenarios, plus a
restart and competing-writer test. New tests were observed failing before fixes.

Run npm test and npm run check; inspect the PR's exact-head CI. Live isolated CODE/VISUAL staging was subsequently verified at source aa21e0716d498a692b558e18cd9da1568d4a92c5; production bindings remain unmodified. To accept real execution,
connect owner-approved providers on isolated staging, verify exact deployed SHA
and storage/provider bindings, and observe an authorized real artifact and its
independent destination readback. Server execution deadlines/cancellation,
provider idempotency and configurable PIXIE retry policy remain separate work.
No production deployment, real task dispatch, new secret or authority grant is
part of this change.

## Concrete edge providers — bounded staging capability

`src/edge-providers.mjs` now provides an actual Cloudflare runtime implementation.
`edge-provider-entry.mjs` exports CodeProvider / VisualProvider as private
WorkerEntrypoint RPC services. `staging-entry.mjs` keeps the existing signed rail
and adds an authenticated read-only artifact route. Separate Wrangler configs
bind only the existing factory-district-preview bucket; production config is not
modified. The staging rail secret is separate from production.

Supported CODE work is a single JavaScript Worker module, an exactly-once text
replacement patch, and 1–8 explicit HTTP response assertions. The input is a
schema FACTORY_EDGE_JOB_V1 JSON object with exact Work/checkpoint/domain identity,
baseSource, patch {find,replace}, and tests [{path,status,body}]. Each Work supplies
one immutable inputRef of the form
r2://factory-district-preview/edge-inputs/<id>.json#sha256=<64-hex-digest>.
Providers recheck the digest and identity on every step. They read no arbitrary
bucket keys or network URL from the input.

The CODE provider applies the patch, persists the JS module, executes tests in
Cloudflare Dynamic Workers with globalOutbound:null and no passed bindings,
checks the persisted artifact, repeats the edge test checkpoint, creates a
content-addressed dynamic staging deployment, and independently loads the saved
module again for runtime verification. This is not arbitrary Node.js/npm,
GitHub CI, or a production deployment. Existing pipeline field ciCheckpoint is
explicitly labelled EDGE_RUNTIME_TESTS_NOT_GITHUB_CI in its evidence.

VISUAL supports a static HTML card template with design {title,body,accent} and
a bounded viewport {width,height}. It creates HTML, calls Cloudflare Browser Run
Quick Actions for real PNG rendering and rendered HTML, verifies PNG structure,
viewport, text presence and saved output digest, then exports PNG. It does not
claim aesthetic judgment, arbitrary image generation, or interactive UI testing.
CSP blocks scripts and external resources in the generated page.

Result objects and per-step evidence use edge-results/<Work>/<checkpoint>/<run>/
in staging R2. Writes are conditional and conflicting artifacts are not replaced.
The authenticated /staging/artifact/<encoded-key> endpoint can read only that
prefix; there is no public unsigned execution or artifact upload route. The
provider itself has no enabled public workers.dev endpoint.


## Observed live staging acceptance — 2026-10-22 (Asia/Bangkok)

At source aa21e0716d498a692b558e18cd9da1568d4a92c5, the two separate staging
Workers were deployed and their actual bindings read back from Cloudflare:
factory-code-visual-staging -> private factory-machinery-staging CodeProvider /
VisualProvider; both use factory-district-preview, not the production bucket.
The provider's workers.dev and Preview endpoints are disabled. A distinct staging
HMAC secret was created; production secrets and Work authority were unchanged.

Actual signed staging jobs completed through the existing Factory pipelines:

- CODE receipt receipt-d7a3748b-e16b-4936-bd28-d19edfcbcc20: patched "before" to
  "live", executed real Dynamic Worker HTTP assertions, saved the module and a
  content-addressed staging deployment, and independently reloaded the saved
  code for runtime verification. Downloaded JS SHA-256 matched runtimeSha.
- VISUAL receipt receipt-31e864a5-252c-4281-b3a3-5011a1b42321: created HTML,
  rendered it using real Browser Run, verified rendered text and PNG viewport,
  then exported an 800x600 PNG (27,775 bytes). Independently downloaded PNG
  SHA-256 matched finalOutput; PIL verified/decoded it and it was visually read.
- Independent signed owner readbacks matched initial persisted results exactly.
  Identical resubmissions returned the same receipt and readback. Unsigned
  dispatch was rejected HTTP 401.

The Work inputs were synthetic acceptance tasks; the remote code execution,
browser render, R2 writes, receipts and downloads were real staging effects.
This is bounded staging acceptance, not general Node/npm, generative imagery,
subjective visual review or production acceptance. See
[evidence JSON](evidence/edge-staging-proof.json) and
[downloaded PNG](evidence/edge-visual-staging.png).

Local and exact-source GitHub CI: 249/249 tests and syntax PASS. CI run
39665109372 tested source aa21e071; PR merge tree matched the deployed-source
tree d2cf58592c49b9dcfa9efb42e4fcd1c2a1c5077a. The later evidence-only commit
adds these readbacks without redeploying the same executable code.
