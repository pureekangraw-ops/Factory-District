# Single approval packet: complete the existing L1 task

Status: PENDING NEW CAPABILITY/AUTHORITY APPROVAL. No permission, Work Authority, credential, live task, or deployed service has been changed. Parent retains release/execution decisions.

## Evidence and precise missing boundary

GO main c2cd402dda3eeadd961d9cf74fdba483cfc8d223 still lacks the caller fix. Local candidate 21dddca5a1edfff7f2139623a225992148565572 is preserved and passes 47 tests. PANTHEON main 97db6ca63bfcc1cd6a783576a263e03727cce28f includes the receiver fix. Factory main 9a56fded285641a37fdf9a92c388f546ccb9d47f added interop smoke tooling, not an L1 artifact route. No AGENTS.md or .agents/skills files were found in these repositories; existing GO bridge/code-copilot instructions apply.

Fresh owner-connector readback: task task_d6c9e93a42fd4f339bb47d941428dd08 remains QUEUED with latest_run_id=null and original request_sha256 de0038fe8be999fe6a1c725156cd9684ac4887127ef783a659148ccdf36d0b24. Factory job read is 404. Factory health is CONNECTED/READY. Connector deployment metadata reads return CLOUDFLARE_NOT_CONFIGURED; deployed SHAs are parent-supplied evidence, not independently verified by that connector.

A local test connects the actual patched GO worker to current OwnerBridge and WorkHub using the exact task fixture: response is 422 UNSUPPORTED, one bridge call, zero Factory calls, zero table changes. A separately signed local Factory preflight for the proposed operation returns 403 PANTHEON_RAIL_SCOPE_DENIED with zero storage writes/runs. The current allowed tuple is LOGIC / PLACE_DWARF_LOGIC_TRAINEE / EXECUTE:LOGIC (src/rail-auth.mjs). Changing that allowlist is a specific permission expansion and cannot be represented as a queue bug fix.

## Requested permission and implementation delta

Approve only the existing PANTHEON authenticated principal to use LOGIC / CREATE_L1_TEXT_ARTIFACT / EXECUTE:TEXT_ARTIFACT:L1 for the exact task ID and request hash above, checkpoint cp-task_d6c9e93a42fd4f339bb47d941428dd08, existing pass identity work-pass://pantheon-task_d6c9e93a42fd4f339bb47d941428dd08. LOGIC is the existing ownership domain; this operation must invoke a dedicated text formatter, never trainee placement. No arbitrary task, shell, code loader, URL, filename, user content, CODE deployment, credential or principal changes.

PANTHEON needs an explicit approved operation binding keyed by existing task ID, original action key and request hash. Keep the original task, request, hash and action identity; do not reinterpret prose or rewrite the d1.create_text_artifact action into a trainee action. Persist the approval reference and route mapping separately. This requires a narrowly reviewed schema addition for the binding and dispatch correlation. The generic local /run path must reject Factory-bound tasks, and Factory dispatch must atomically claim the task status as well as its job so the two executors cannot race. Queue creates only job/binding audit state, never execution or a second task.

Factory needs an exact-operation validator, isolated formatter/storage adapter, and authenticated artifact readback under the existing HMAC rail. A pure formatter is prepared locally in src/l1-text-artifact.mjs; it is not registered or invoked by any worker, performs no I/O, grants no permission, and produces no receipt. All route, authority and live storage integration remains pending this approval.

## Artifact storage and permitted side effects

Reuse existing private Factory RECORD_STORE R2 binding (bucket factory); no new IAM, bucket or public access. Restrict new writes to records/factory/l1/<exact-task-id>/<request-hash>/ for claim and artifact records, with existing correlated receipt/event storage. Content is a small fixed UTF-8 template: marker YGG FACTORY L1 PASS, exact task/checkpoint identity, request hash, and a test timestamp chosen once and persisted at claim creation. Hash the exact artifact bytes. No customer data, external communication, payment, public publishing, production application change or network/provider execution during the task.

Expose only authenticated exact-task artifact readback. Return its source reference, bytes/content digest, receipt identity, task/checkpoint/request hash and persisted timestamp. A receipt must be written only from verified durable artifact evidence; owner readback recomputes the digest from retrieved bytes, not from a claimed success field.

## Idempotency, partial failure and rollback

Use the existing atomic R2 compare-and-set claim primitive before writing the artifact. Same task/checkpoint/hash retries reuse the original timestamp, content and receipt; mismatched scope/hash is rejected. D1 and R2 are not one transaction: persist dispatch intent, reconcile uncertain outcomes by exact durable readback, never blindly repeat the side effect. Concurrent generic /run and Factory dispatch must have one winner. After any uncertain effect, remain NEEDS_RECONCILIATION until readback resolves it. Rollback disables ingress without deleting evidence or requeueing executed work.

## Tests required before approved release/execution

Positive integrated GO -> OwnerBridge -> WorkHub -> actual Factory worker tests with isolated in-memory D1/R2, plus authenticated artifact and receipt readback. Negative tests: wrong task/hash/permission/principal, tampered content, missing authority, generic /run races, concurrent queue/dispatch, lost responses at every write, process restart, clock change on retries, completed/uncertain replay, and denied artifact access. Preserve legacy LOGIC behavior. Demonstrate zero CODE/provider/deploy calls and no duplicate task/action. Mock receipt evidence remains explicitly local.

## Ordered release and acceptance

Parent approves scope above, then implementation and independent review can finish. Parent coordinates Factory capability deployment first, PANTHEON mapping/claim migration second, GO caller release third; verify each deployed source and supported contract. Parent then authorizes exactly one existing-task queue and dispatch. Acceptance requires original request/hash unchanged, no duplicate task, Factory durable artifact matching fixed template, one verified receipt, exact authenticated owner byte/digest readback, and replay evidence with no second effect. Report queue, execution, receipt, artifact and owner verification separately. If any capability/authority is absent, return BLOCKED/UNSUPPORTED with no execution.
