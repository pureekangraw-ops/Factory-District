export const PIXIE_ID = 'PIXIE-01';
export const ROOM_IDS = Object.freeze(['ROOM-A', 'ROOM-B', 'ROOM-C', 'ROOM-D']);

export const CYCLE_ACTIONS = Object.freeze([
  'ZERO', 'STERILIZE', 'TEST', 'DEBUG', 'IMPROVE', 'CANNON', 'LEARN',
  'RETEST', 'CLEAN_AGAIN', 'AUDIT', 'PROPOSE', 'PROMOTE_LEARNING',
]);
export const CYCLE_STAGES = Object.freeze(['ZERO', 'STERILIZE', 'TEST', 'DEBUG', 'IMPROVE', 'CANNON', 'LEARN']);
export const CYCLE_STATES = Object.freeze([
  'IDLE', 'ZEROING', 'ZERO_CONFIRMED', 'STERILIZING', 'STERILE', 'CONTAMINATED',
  'TESTING', 'DEBUGGING', 'IMPROVING', 'CANNON_RUNNING', 'READY_CANDIDATE',
  'QUARANTINED', 'BLOCKED', 'LEARNING', 'COMPLETE',
]);
export const RESULTS = Object.freeze([
  'ZERO_CONFIRMED', 'ZERO_FAILED', 'STERILE', 'CONTAMINATED', 'UNKNOWN',
  'TEST_PASS', 'TEST_FAIL', 'INCONCLUSIVE', 'NEEDS_FIX', 'DEBUG_COMPLETE',
  'CANDIDATE_READY', 'CANNON_PASS', 'CANNON_FAIL', 'LEARNED',
]);
export const RUN_CLASSES = Object.freeze(['ROOM_TEST_RUN', 'MASTER_TEST_RUN', 'AUDIT_TEST_RUN', 'FINAL_SWEEP_RUN', 'CANNON']);
export const RUN_STATUSES = Object.freeze(['UNRUN', 'RUNNING', 'PASS', 'FAIL', 'UNKNOWN', 'INCONCLUSIVE', 'NEEDS_FIX', 'CANNON_RUNNING', 'CANNON_PASS', 'CANNON_FAIL', 'TEST_PASS', 'TEST_FAIL']);
export const PROPOSAL_STATUSES = Object.freeze(['PROPOSED', 'ACCEPTED', 'REJECTED', 'REQUEST_MORE_EVIDENCE', 'EXPANDED_TO_CROSS_ROOM', 'EXPANDED_TO_LAB_WIDE', 'QUEUED']);
export const ARTIFACT_STATUSES = Object.freeze(['EXPERIMENTAL', 'READY_CANDIDATE']);
export const EVIDENCE_STATUSES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN']);
export const GOLDEN_STATUSES = Object.freeze(['GOLDEN_CANDIDATE', 'VERIFY_REPLAY', 'GOLDEN_ACTIVE', 'REGRESSION_CASE', 'RETIRED']);
export const MATRIX_STATUSES = Object.freeze(['READY_TO_RUN', 'RUNNING', 'TRIAGE', 'TEST_PASS', 'TEST_FAIL', 'INCONCLUSIVE', 'READY_CANDIDATE', 'NEEDS_FIX']);
export const DEBUG_CONFIDENCE = Object.freeze(['SUSPECTED', 'SUPPORTED', 'CONFIRMED']);
export const ROOM_LIFECYCLE_STAGES = Object.freeze(['ARCHIVE', 'ZERO', 'STERILIZE', 'VERIFY_CLEAN', 'LOAD_CLEAN_SEED', 'READY', 'QUARANTINED', 'CLEAN_AGAIN']);

export const TEST_CATEGORIES = Object.freeze([
  'FUNCTIONAL', 'INTEGRATION', 'CONTRACT', 'REGRESSION', 'GOLDEN',
  'PERMISSION_BOUNDARY', 'RECOVERY', 'MIGRATION', 'COMPATIBILITY', 'CHAOS',
  'PERFORMANCE', 'INSTALL_UPDATE', 'RELEASE_PACKAGE', 'SECURITY_ORIENTED', 'UNKNOWN_EDGE',
]);
export const ACCESS_TYPES = Object.freeze(['READ', 'COPY', 'SNAPSHOT', 'IMPORT']);
export const FACTORY_SIMULATION_STAGES = Object.freeze(['PLAN', 'BUILD', 'ASSEMBLY', 'MERGE', 'CHECK', 'OUTPUT']);
export const LAB_WARP_TARGETS = Object.freeze(['LAB', 'ROOM', 'ROOM_REPORT', 'SESSION', 'TEST_MATRIX', 'TEST_RUN', 'BUG_CAPSULE', 'GOLDEN_CASE', 'GO_ATTENTION', 'EVIDENCE', 'ARTIFACT', 'LOGIC_DRAFT', 'EXAMPLE_EXPERIMENT', 'FACTORY_HANDOFF']);

const text = (value) => String(value ?? '').trim();
const clone = (value) => value == null ? value : structuredClone(value);
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
const iso = () => new Date().toISOString();
const requireText = (value, label) => { const result = text(value); if (!result) throw new Error(`${label} is required`); return result; };
const ref = (value) => text(value) || null;
const freeze = (value) => Object.freeze(clone(value));
const verifiedEvidenceRecords = new WeakSet();
const EVIDENCE_TRUST_SCHEME = 'PIXIE_EVIDENCE_PROVIDER_V1';
const upper = (value) => text(value).toUpperCase();
const statusOr = (value, fallback = 'UNKNOWN') => upper(value || fallback);
const evidencePayload = ({ evidenceId, kind, status, sourceRef, capturedAt, details }) => ({
  evidenceId, kind, status, sourceRef, capturedAt, details: clone(details),
});

export function createEvidenceTrustProvider({ providerId, sign = null, verify } = {}) {
  const id = requireText(providerId, 'providerId');
  if (typeof verify !== 'function') throw new Error('Evidence trust provider requires verify');
  return Object.freeze({
    providerId: id,
    sign: typeof sign === 'function' ? (payload) => requireText(sign(clone(payload)), 'proof') : null,
    verify: (payload, proof) => Boolean(verify(clone(payload), proof)),
  });
}

export function createEvidenceVerifier(trustProvider) {
  if (!trustProvider?.providerId || typeof trustProvider.verify !== 'function') throw new Error('Evidence verifier requires a trust provider');
  return createEvidenceTrustProvider({
    providerId: trustProvider.providerId,
    verify: (payload, proof) => trustProvider.verify(payload, proof),
  });
}

export function createEvidence({ evidenceId, kind, status = 'UNKNOWN', sourceRef, capturedAt = iso(), details = null } = {}) {
  const normalized = upper(status);
  if (!EVIDENCE_STATUSES.includes(normalized)) throw new Error(`Unknown evidence status: ${status}`);
  const payload = evidencePayload({
    evidenceId: requireText(evidenceId, 'evidenceId'),
    kind: requireText(kind, 'kind'),
    status: normalized,
    sourceRef: requireText(sourceRef, 'sourceRef'),
    capturedAt,
    details,
  });
  return Object.freeze({ ...payload, verifiedAt: null, verification: null, trust: 'UNVERIFIED' });
}

export function createVerifiedEvidence(
  { evidenceId, kind, status = 'UNKNOWN', sourceRef, capturedAt = iso(), details = null } = {},
  { trustProvider, verifiedAt = capturedAt } = {},
) {
  if (!trustProvider?.providerId || typeof trustProvider.sign !== 'function') throw new Error('EVIDENCE_SIGNER_REQUIRED');
  const normalized = upper(status);
  if (!EVIDENCE_STATUSES.includes(normalized)) throw new Error(`Unknown evidence status: ${status}`);
  const payload = evidencePayload({
    evidenceId: requireText(evidenceId, 'evidenceId'),
    kind: requireText(kind, 'kind'),
    status: normalized,
    sourceRef: requireText(sourceRef, 'sourceRef'),
    capturedAt,
    details,
  });
  const signedPayload = { ...payload, verifiedAt };
  const record = Object.freeze({
    ...signedPayload,
    verification: {
      scheme: EVIDENCE_TRUST_SCHEME,
      providerId: trustProvider.providerId,
      proof: trustProvider.sign(signedPayload),
    },
    trust: 'VERIFIED',
  });
  verifiedEvidenceRecords.add(record);
  return record;
}

const hasValidEvidenceShape = (value) => Boolean(
  value
  && typeof value === 'object'
  && value.evidenceId
  && value.kind
  && value.sourceRef
  && value.verifiedAt
  && EVIDENCE_STATUSES.includes(upper(value.status))
  && value.verification?.scheme === EVIDENCE_TRUST_SCHEME
  && value.verification?.providerId
  && value.verification?.proof,
);

const hasDurableEvidenceProof = (value, trustProvider) => {
  if (!hasValidEvidenceShape(value) || !trustProvider?.providerId || typeof trustProvider.verify !== 'function') return false;
  if (value.verification.providerId !== trustProvider.providerId) return false;
  try {
    return trustProvider.verify({ ...evidencePayload(value), verifiedAt: value.verifiedAt }, value.verification.proof);
  } catch {
    return false;
  }
};

export function rehydrateEvidenceRecord(value, { trustProvider } = {}) {
  if (!hasDurableEvidenceProof(value, trustProvider)) throw new Error('EVIDENCE_REHYDRATION_REJECTED');
  const record = Object.freeze({
    ...evidencePayload(value),
    verifiedAt: value.verifiedAt,
    verification: { ...value.verification },
    trust: 'VERIFIED',
  });
  verifiedEvidenceRecords.add(record);
  return record;
}

export function verifyEvidenceRecord(value, { trustProvider } = {}) {
  try { return rehydrateEvidenceRecord(value, { trustProvider }); }
  catch { return null; }
}

export function isVerifiedEvidenceRecord(value, { trustProvider } = {}) {
  return Boolean(
    value
    && typeof value === 'object'
    && (verifiedEvidenceRecords.has(value) || hasDurableEvidenceProof(value, trustProvider)),
  );
}

const proofStatus = ({ evidenceStatus, evidenceRefs = [], evidence = [], evidenceVerifier = null } = {}) => {
  const explicit = upper(evidenceStatus);
  const trusted = evidence.filter((item) => isVerifiedEvidenceRecord(item, { trustProvider: evidenceVerifier }));
  const values = trusted.map((item) => upper(item.status));
  const refs = unique(evidenceRefs);
  const trustedIds = new Set(trusted.map((item) => text(item.evidenceId)));
  if (values.includes('FAIL') || explicit === 'FAIL') return 'FAIL';
  if (!trusted.length || values.includes('UNKNOWN') || refs.some((refId) => !trustedIds.has(refId))) return 'UNKNOWN';
  return (!explicit || explicit === 'PASS') && values.every((value) => value === 'PASS') ? 'PASS' : 'UNKNOWN';
};

export function createSterilizationAdapter({ adapterId, name, clean, sterilize, evidencePolicy = 'required' } = {}) {
  return Object.freeze({ adapterId: requireText(adapterId, 'adapterId'), name: requireText(name, 'name'), clean: typeof clean === 'function' ? clean : null, sterilize: typeof sterilize === 'function' ? sterilize : null, evidencePolicy: requireText(evidencePolicy, 'evidencePolicy') });
}

export function runSterilization({ adapter, context = {}, evidenceVerifier = null, now = iso } = {}) {
  if (!adapter?.sterilize) return freeze({ status: 'UNKNOWN', evidenceStatus: 'UNKNOWN', evidenceRefs: [], reason: 'STERILIZATION_ADAPTER_UNAVAILABLE', at: now() });
  let result;
  try { result = adapter.sterilize(clone(context)); } catch (error) { return freeze({ status: 'FAIL', evidenceStatus: 'FAIL', evidenceRefs: [], reason: 'STERILIZATION_ADAPTER_ERROR', error: error.message, at: now() }); }
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const evidenceRefs = unique(result?.evidenceRefs || evidence.map((item) => item.evidenceId));
  const evidenceStatus = proofStatus({ evidenceStatus: result?.evidenceStatus, evidenceRefs, evidence, evidenceVerifier });
  const status = upper(result?.status || (evidenceStatus === 'PASS' ? 'STERILE' : evidenceStatus));
  return freeze({ ...clone(result), status, evidenceStatus, evidenceRefs, at: now() });
}

export function createRoom({ roomId, roomPixieId, assignedPurpose = null, now = iso } = {}) {
  const id = requireText(roomId, 'roomId');
  return freeze({ roomId: id, roomPixieId: requireText(roomPixieId || `PIXIE-${id.replace(/^ROOM-/, '')}`, 'roomPixieId'), status: 'READY', lifecycleStage: 'READY', lifecycleHistory: ['READY'], assignedPurpose: ref(assignedPurpose), activeSessionId: null, currentCycleId: null, updatedAt: now() });
}
export function createDefaultRooms({ now = iso } = {}) { return ROOM_IDS.map((roomId) => createRoom({ roomId, assignedPurpose: roomId === 'ROOM-D' ? 'INSPECT_DEBUG' : null, now })); }

export function createIsolationContext({ appId, roomId, sessionId, cycleId, fixtureRef, snapshotRef = null, allowedDependencyRefs = [], grantRefs = [], baselineHash } = {}) {
  return freeze({ appId: requireText(appId, 'appId'), roomId: requireText(roomId, 'roomId'), sessionId: requireText(sessionId, 'sessionId'), cycleId: requireText(cycleId, 'cycleId'), namespace: `pixie/${text(appId)}/${text(roomId)}/${text(sessionId)}/${text(cycleId)}`, fixtureRef: requireText(fixtureRef, 'fixtureRef'), snapshotRef: ref(snapshotRef), allowedDependencyRefs: unique(allowedDependencyRefs), grantRefs: unique(grantRefs), baselineHash: requireText(baselineHash, 'baselineHash') });
}

export function createCycle({ cycleId, subjectRef, roomId, sessionId, initiatedBy = PIXIE_ID, supervisedBy = PIXIE_ID, logicVersion, isolation, now = iso } = {}) {
  return freeze({ cycleId: requireText(cycleId, 'cycleId'), subjectRef: requireText(subjectRef, 'subjectRef'), roomId: requireText(roomId, 'roomId'), sessionId: requireText(sessionId, 'sessionId'), initiatedBy: requireText(initiatedBy, 'initiatedBy'), supervisedBy: requireText(supervisedBy, 'supervisedBy'), logicVersion: requireText(logicVersion, 'logicVersion'), isolation: clone(isolation), stage: 'ZERO', state: 'IDLE', steps: [], activeTestRunRefs: [], bugRefs: [], debugRefs: [], regressionRefs: [], goldenRefs: [], unknowns: [], learningRefs: [], nextAction: 'ZERO', createdAt: now(), updatedAt: now() });
}

function transitionFor(action, result, current) {
  const a = upper(action); const r = upper(result);
  const expected = current.nextAction;
  if (expected && !['AUDIT', 'PROPOSE', 'PROMOTE_LEARNING'].includes(a) && a !== expected) throw new Error(`LIFECYCLE_ORDER_REQUIRED:${expected}`);
  if (a === 'ZERO') {
    if (r === 'ZERO_CONFIRMED') return { stage: 'STERILIZE', state: 'ZERO_CONFIRMED', nextAction: 'STERILIZE' };
    return { stage: 'ZERO', state: r === 'ZERO_FAILED' ? 'ZEROING' : 'BLOCKED', nextAction: 'ZERO', blockedReason: r === 'UNKNOWN' ? 'ZERO_PROOF_UNKNOWN' : 'ZERO_PROOF_FAILED' };
  }
  if (a === 'STERILIZE') {
    if (r === 'STERILE') return { stage: 'TEST', state: 'STERILE', nextAction: 'TEST' };
    return { stage: 'STERILIZE', state: 'QUARANTINED', nextAction: 'CLEAN_AGAIN', safetyPath: 'QUARANTINED', blockedReason: r === 'UNKNOWN' ? 'STERILIZATION_PROOF_UNKNOWN' : 'STERILIZATION_FAILED' };
  }
  if (a === 'TEST' || a === 'RETEST') {
    if (r === 'TEST_PASS') return { stage: 'CANNON', state: 'TESTING', nextAction: 'CANNON' };
    if (['TEST_FAIL', 'NEEDS_FIX'].includes(r)) return { stage: 'DEBUG', state: 'DEBUGGING', nextAction: 'DEBUG' };
    return { stage: 'TEST', state: r === 'UNKNOWN' ? 'BLOCKED' : 'TESTING', nextAction: a, blockedReason: r === 'UNKNOWN' ? 'TEST_PROOF_UNKNOWN' : undefined };
  }
  if (a === 'DEBUG') return { stage: 'IMPROVE', state: 'IMPROVING', nextAction: 'IMPROVE' };
  if (a === 'IMPROVE') return { stage: 'TEST', state: 'TESTING', nextAction: 'RETEST' };
  if (a === 'CANNON') return r === 'CANNON_PASS' ? { stage: 'LEARN', state: 'READY_CANDIDATE', nextAction: 'LEARN' } : { stage: 'DEBUG', state: 'DEBUGGING', nextAction: 'DEBUG', blockedReason: r === 'UNKNOWN' ? 'CANNON_PROOF_UNKNOWN' : 'CANNON_FAILED' };
  if (a === 'LEARN') return r === 'LEARNED' ? { stage: 'LEARN', state: 'COMPLETE', nextAction: null } : { stage: 'LEARN', state: 'BLOCKED', nextAction: 'LEARN', blockedReason: 'LEARNING_NOT_PROMOTED' };
  if (a === 'CLEAN_AGAIN') return { stage: 'ZERO', state: 'ZEROING', nextAction: 'ZERO', safetyPath: 'CLEAN_AGAIN_TO_ZERO' };
  return { stage: current.stage, state: current.state, nextAction: current.nextAction };
}

export function applyCycleAction(cycle, { action, result, actor, expected, observed, fixtureRef, snapshotRef, logicVersion, evidenceRefs = [], changeRefs = [], testRunRefs = [], evidenceStatus, evidence = [], evidenceVerifier = null, now = iso } = {}) {
  const current = clone(cycle); const actionName = requireText(action, 'action').toUpperCase(); const resultName = requireText(result, 'result').toUpperCase();
  if (!CYCLE_ACTIONS.includes(actionName)) throw new Error(`Unknown cycle action: ${action}`);
  if (['ZERO', 'STERILIZE'].includes(actionName) && proofStatus({ evidenceStatus, evidenceRefs, evidence, evidenceVerifier }) !== 'PASS' && ['ZERO_CONFIRMED', 'STERILE'].includes(resultName)) throw new Error(`${actionName}_REQUIRES_PASS_EVIDENCE`);
  const transition = transitionFor(actionName, resultName, current); const timestamp = now();
  current.steps.push({ action: actionName, actor: requireText(actor || current.initiatedBy, 'actor'), result: resultName, expected: clone(expected ?? null), observed: clone(observed ?? null), fixtureRef: ref(fixtureRef), snapshotRef: ref(snapshotRef), logicVersion: text(logicVersion) || current.logicVersion, evidenceStatus: proofStatus({ evidenceStatus, evidenceRefs, evidence, evidenceVerifier }), evidenceRefs: unique(evidenceRefs), changeRefs: unique(changeRefs), testRunRefs: unique(testRunRefs), at: timestamp });
  Object.assign(current, transition, { updatedAt: timestamp });
  if (transition.safetyPath === 'QUARANTINED') current.quarantineReason = text(transition.blockedReason || resultName);
  if (actionName === 'DEBUG') current.debugRefs = unique([...current.debugRefs, ...changeRefs, ...testRunRefs]);
  if (actionName === 'RETEST') current.regressionRefs = unique([...current.regressionRefs, ...testRunRefs]);
  if (actionName === 'CANNON') current.goldenRefs = unique([...current.goldenRefs, ...testRunRefs]);
  if (actionName === 'LEARN' && resultName === 'LEARNED') current.nextAction = null;
  return freeze(current);
}

export function createTestType({ testTypeId, name, category, inputContract, runner, runnerInterface = null, expectedContract, severity = 'MEDIUM', replayable = true, requiresGrant = false, evidencePolicy, runnerStatus = 'CONTRACT_ONLY' } = {}) {
  const normalizedRunner = runnerInterface && typeof runnerInterface.run === 'function' ? { name: text(runnerInterface.name) || 'anonymous', run: runnerInterface.run } : null;
  return Object.freeze({ testTypeId: requireText(testTypeId, 'testTypeId'), name: requireText(name, 'name'), category: requireText(category, 'category'), inputContract: clone(inputContract ?? { source: 'LAB_FIXTURE' }), runner: ref(runner), runnerInterface: normalizedRunner, expectedContract: requireText(expectedContract, 'expectedContract'), severity: requireText(severity, 'severity'), replayable: Boolean(replayable), requiresGrant: Boolean(requiresGrant), evidencePolicy: requireText(evidencePolicy, 'evidencePolicy'), runnerStatus: requireText(runnerStatus, 'runnerStatus') });
}
export function createTestTypeRegistry({ testTypes = [] } = {}) { const registry = new Map(); for (const type of testTypes) registerTestType(registry, type); return registry; }
export function registerTestType(registry, testType) {
  if (!(registry instanceof Map)) throw new TypeError('registry must be a Map');
  if (!testType?.testTypeId) throw new Error('testType.testTypeId is required');
  if (!TEST_CATEGORIES.includes(testType.category)) throw new Error(`Unsupported test category: ${testType.category}`);
  if (registry.has(testType.testTypeId)) throw new Error(`Duplicate test type: ${testType.testTypeId}`);
  const { runnerInterface, ...serializableType } = testType;
  const value = Object.freeze({ ...clone(serializableType), executionKind: testType.executionKind || (testType.requiresGrant ? 'GRANTED_SNAPSHOT' : 'LAB_FIXTURE'), runnerStatus: testType.runnerStatus || 'CONTRACT_ONLY', runnerInterface: runnerInterface && typeof runnerInterface.run === 'function' ? { name: text(runnerInterface.name) || 'anonymous', run: runnerInterface.run } : null });
  registry.set(testType.testTypeId, value); return value;
}
export async function executeTestType(registry, testTypeId, context = {}) {
  const type = registry?.get(testTypeId); if (!type) return { status: 'UNKNOWN', reason: 'TEST_TYPE_NOT_REGISTERED' };
  if (!type.runnerInterface?.run || type.runnerStatus === 'CONTRACT_ONLY') return { status: 'UNKNOWN', reason: 'UNSUPPORTED_RUNNER', testTypeId };
  try { const result = await type.runnerInterface.run(clone(context)); return { ...clone(result), status: upper(result?.status || 'UNKNOWN'), testTypeId }; } catch (error) { return { status: 'FAIL', reason: 'RUNNER_ERROR', error: error.message, testTypeId }; }
}

export function createTestMatrix({ matrixId, subjectRef, logicVersion, roomId = null, rows = [], now = iso } = {}) {
  return freeze({ matrixId: requireText(matrixId, 'matrixId'), subjectRef: requireText(subjectRef, 'subjectRef'), logicVersion: requireText(logicVersion, 'logicVersion'), roomId: ref(roomId), rows: clone(rows).map((row) => ({ testTypeId: requireText(row.testTypeId, 'row.testTypeId'), caseRefs: unique(row.caseRefs), status: ['PENDING', ''].includes(text(row.status).toUpperCase()) ? 'UNRUN' : upper(row.status), required: row.required !== false })), overallStatus: 'INCONCLUSIVE', lifecycle: 'READY_TO_RUN', createdAt: now(), updatedAt: now() });
}
export function matrixStatus(matrix, rowStatuses = {}) {
  const rows = matrix.rows.map((row) => ({ ...row, status: upper(rowStatuses[row.testTypeId] || row.status || 'UNRUN') }));
  const required = rows.filter((row) => row.required); const statuses = required.map((row) => row.status);
  let overall = 'INCONCLUSIVE';
  if (!required.length || statuses.some((s) => ['UNRUN', 'UNKNOWN', 'INCONCLUSIVE'].includes(s))) overall = 'INCONCLUSIVE';
  else if (statuses.some((s) => ['FAIL', 'TEST_FAIL', 'NEEDS_FIX'].includes(s))) overall = statuses.includes('NEEDS_FIX') ? 'NEEDS_FIX' : 'TEST_FAIL';
  else if (statuses.every((s) => ['PASS', 'TEST_PASS', 'CANNON_PASS'].includes(s))) overall = 'TEST_PASS';
  return { rows, overall };
}
export function updateMatrixStatus(matrix, rowStatuses = {}) { const next = clone(matrix); const result = matrixStatus(next, rowStatuses); next.rows = result.rows; next.overallStatus = result.overall; next.lifecycle = result.overall === 'TEST_PASS' ? 'READY_CANDIDATE' : ['TEST_FAIL', 'NEEDS_FIX'].includes(result.overall) ? 'TRIAGE' : 'TRIAGE'; next.updatedAt = iso(); return freeze(next); }
export function startMatrix(matrix) { return freeze({ ...clone(matrix), lifecycle: 'RUNNING', overallStatus: 'INCONCLUSIVE', updatedAt: iso() }); }

export function createTestRun({ runId, runClass = 'ROOM_TEST_RUN', initiatedBy, executedBy, scope, purpose, roomId = null, sourceRoomRefs = [], matrixRef = null, testTypeId, caseRef = null, fixtureRef = null, snapshotRef = null, logicVersion, expected, observed, status = 'UNRUN', evidenceRefs = [], bugCapsuleRef = null, unknowns = [], rerunOf = null, immutable = true, now = iso } = {}) {
  if (!RUN_CLASSES.includes(runClass)) throw new Error(`Unknown runClass: ${runClass}`);
  const normalized = upper(status); if (!RUN_STATUSES.includes(normalized)) throw new Error(`Unknown run status: ${status}`);
  return freeze({ runId: requireText(runId, 'runId'), runClass, initiatedBy: requireText(initiatedBy, 'initiatedBy'), executedBy: requireText(executedBy, 'executedBy'), scope: requireText(scope, 'scope'), purpose: requireText(purpose, 'purpose'), roomId: ref(roomId), sourceRoomRefs: unique(sourceRoomRefs), matrixRef: ref(matrixRef), testTypeId: ref(testTypeId), caseRef: ref(caseRef), fixtureRef: ref(fixtureRef), snapshotRef: ref(snapshotRef), logicVersion: requireText(logicVersion, 'logicVersion'), expected: clone(expected ?? null), observed: clone(observed ?? null), status: normalized, evidenceRefs: unique(evidenceRefs), bugCapsuleRef: ref(bugCapsuleRef), unknowns: unique(unknowns), rerunOf: ref(rerunOf), immutable: Boolean(immutable), createdAt: now() });
}
export function rerunTestRun(previous, { runId, executedBy, observed, status = 'UNRUN', evidenceRefs = [], unknowns = [], now = iso } = {}) { return createTestRun({ ...clone(previous), runId, executedBy: executedBy || previous.executedBy, observed, status, evidenceRefs, unknowns, rerunOf: previous.runId, now }); }

export function createTestProposal({ proposalId, proposedBy, purpose, testTypeId, sourceRoomRefs = [], targetRefs = [], reason, evidenceRefs = [], requestedScope = 'ROOM', now = iso } = {}) { return freeze({ proposalId: requireText(proposalId, 'proposalId'), proposedBy: requireText(proposedBy, 'proposedBy'), purpose: requireText(purpose, 'purpose'), testTypeId: requireText(testTypeId, 'testTypeId'), sourceRoomRefs: unique(sourceRoomRefs), targetRefs: unique(targetRefs), reason: requireText(reason, 'reason'), evidenceRefs: unique(evidenceRefs), requestedScope: requireText(requestedScope, 'requestedScope'), status: 'PROPOSED', decidedBy: null, decidedAt: null, createdAt: now() }); }
export function decideTestProposal(proposal, { decision, decidedBy = PIXIE_ID, now = iso } = {}) { if (!PROPOSAL_STATUSES.includes(decision)) throw new Error(`Unknown proposal decision: ${decision}`); return freeze({ ...clone(proposal), status: decision, decidedBy, decidedAt: now() }); }

export function createBugCapsule({ bugId, runId, roomId, logicVersion, fixtureRef, expected, observed, reproductionSteps = [], evidenceRefs = [], relatedRefs = [], now = iso } = {}) { return freeze({ bugId: requireText(bugId, 'bugId'), runId: requireText(runId, 'runId'), roomId: requireText(roomId, 'roomId'), logicVersion: requireText(logicVersion, 'logicVersion'), fixtureRef: ref(fixtureRef), expected: clone(expected ?? null), observed: clone(observed ?? null), reproductionSteps: clone(reproductionSteps), evidenceRefs: unique(evidenceRefs), relatedRefs: unique(relatedRefs), status: 'OPEN', createdAt: now() }); }
export function createGoAttention({ attentionId, bugId, roomId, reason, evidenceRefs = [], relatedRefs = [], now = iso } = {}) { return freeze({ attentionId: requireText(attentionId, 'attentionId'), bugId: requireText(bugId, 'bugId'), roomId: requireText(roomId, 'roomId'), reason: requireText(reason, 'reason'), evidenceRefs: unique(evidenceRefs), relatedRefs: unique(relatedRefs), status: 'OPEN', createdAt: now(), updatedAt: now() }); }
export function updateGoAttention(attention, { status, evidenceRefs = [], now = iso } = {}) { const allowed = ['OPEN', 'SEEN_BY_GO', 'FIXING', 'RETEST', 'CLOSED']; if (!allowed.includes(status)) throw new Error(`Unknown GO ATTENTION status: ${status}`); return freeze({ ...clone(attention), status, evidenceRefs: unique([...attention.evidenceRefs, ...evidenceRefs]), updatedAt: now() }); }

export function createGoldenCase({ goldenCaseId, sourceBugId, sourceRunId, inputRef, expected, fixedObserved, replayRecipe, logicVersions = [], evidenceRefs = [], status = 'GOLDEN_CANDIDATE', now = iso } = {}) { if (!GOLDEN_STATUSES.includes(status)) throw new Error(`Unknown golden status: ${status}`); return freeze({ goldenCaseId: requireText(goldenCaseId, 'goldenCaseId'), lifecycle: ['GOLDEN_CANDIDATE'], sourceBugId: requireText(sourceBugId, 'sourceBugId'), sourceRunId: requireText(sourceRunId, 'sourceRunId'), inputRef: requireText(inputRef, 'inputRef'), expected: clone(expected ?? null), fixedObserved: clone(fixedObserved ?? null), replayRecipe: requireText(replayRecipe, 'replayRecipe'), logicVersions: unique(logicVersions), evidenceRefs: unique(evidenceRefs), status, replayCount: 0, lastReplay: null, createdAt: now() }); }
export function replayGoldenCase(golden, { runId, logicVersion, observed, evidenceRefs = [], now = iso } = {}) { const passed = JSON.stringify(observed) === JSON.stringify(golden.expected); const status = passed ? 'GOLDEN_ACTIVE' : 'REGRESSION_CASE'; const lifecycle = [...(golden.lifecycle || ['GOLDEN_CANDIDATE']), 'VERIFY_REPLAY', status]; return freeze({ ...clone(golden), status, lifecycle, replayCount: golden.replayCount + 1, lastReplay: { runId: requireText(runId, 'runId'), logicVersion: requireText(logicVersion, 'logicVersion'), observed: clone(observed), evidenceRefs: unique(evidenceRefs), status, at: now() } }); }
export function createRegressionAlert({ alertId, goldenCaseId, runId, logicVersion, expected, observed, evidenceRefs = [], now = iso } = {}) { return freeze({ alertId: requireText(alertId, 'alertId'), goldenCaseId: requireText(goldenCaseId, 'goldenCaseId'), runId: requireText(runId, 'runId'), logicVersion: requireText(logicVersion, 'logicVersion'), expected: clone(expected), observed: clone(observed), evidenceRefs: unique(evidenceRefs), severity: 'CRITICAL', status: 'OPEN', createdAt: now() }); }

export function createLabMemoryAsset({ memoryId, assetType, sourceCycleId, sourceRunRefs = [], evidenceRefs = [], content, status = 'CANDIDATE', now = iso } = {}) { return freeze({ memoryId: requireText(memoryId, 'memoryId'), assetType: requireText(assetType, 'assetType'), sourceCycleId: requireText(sourceCycleId, 'sourceCycleId'), sourceRunRefs: unique(sourceRunRefs), evidenceRefs: unique(evidenceRefs), content: clone(content ?? null), status, createdAt: now() }); }
export function createArtifact({ artifactId, logicId, version, target, matrixRef = null, sourceRoomRefs = [], testRunRefs = [], evidenceRefs = [], provenance, status = 'EXPERIMENTAL', now = iso } = {}) { if (!ARTIFACT_STATUSES.includes(status)) throw new Error(`Invalid artifact status: ${status}`); return freeze({ artifactId: requireText(artifactId, 'artifactId'), logicId: requireText(logicId, 'logicId'), version: requireText(version, 'version'), target: requireText(target, 'target'), matrixRef: ref(matrixRef), sourceRoomRefs: unique(sourceRoomRefs), testRunRefs: unique(testRunRefs), evidenceRefs: unique(evidenceRefs), provenance: clone(provenance ?? { pixieId: PIXIE_ID }), status, createdAt: now() }); }
export function verifyDoorGuard({ artifact, ownerSeal } = {}) { if (!artifact) return { status: 'STOP', reason: 'ARTIFACT_MISSING' }; if (!ownerSeal) return { status: 'STOP', reason: 'OWNER_SEAL_MISSING' }; for (const field of ['artifactId', 'logicId', 'version', 'target']) if (ownerSeal[field] !== artifact[field]) return { status: 'STOP', reason: `OWNER_SEAL_MISMATCH:${field}` }; if (ownerSeal.status !== 'OFFICIAL') return { status: 'STOP', reason: 'OWNER_SEAL_NOT_OFFICIAL' }; return { status: 'ALLOW_EXIT', reason: null, artifactRef: artifact.artifactId }; }

export function createCandidatePassport({ passportId, artifactId, artifact, matrixRef, sourceRunRefs = [], evidenceRefs = [], matrixStatus = 'UNKNOWN', now = iso } = {}) { return freeze({ passportId: requireText(passportId, 'passportId'), projectionOnly: true, approval: 'NOT_AN_APPROVAL', artifactId: requireText(artifactId || artifact?.artifactId, 'artifactId'), artifact: clone(artifact ?? null), matrixRef: requireText(matrixRef || artifact?.matrixRef, 'matrixRef'), sourceRunRefs: unique(sourceRunRefs), evidenceRefs: unique(evidenceRefs), matrixStatus: upper(matrixStatus), generatedAt: now() }); }
export function projectCandidatePassport({ artifact, runs = [], matrix, evidenceRefs = [], now = iso } = {}) { return createCandidatePassport({ passportId: `PASSPORT-${artifact?.artifactId || 'UNKNOWN'}`, artifact, artifactId: artifact?.artifactId, matrixRef: matrix?.matrixId || artifact?.matrixRef, sourceRunRefs: runs.map((run) => run.runId), evidenceRefs, matrixStatus: matrix?.overallStatus || 'UNKNOWN', now }); }

export function createRoomReport({ roomId, roomPixieId, roomStatus, activeSubject, currentTest, latestResult, bugSummary = {}, goAttention = [], unknowns = [], importantEvidenceRefs = [], readyCandidates = [], nextAction = null, now = iso } = {}) { return freeze({ roomId: requireText(roomId, 'roomId'), roomPixieId: requireText(roomPixieId, 'roomPixieId'), roomStatus: requireText(roomStatus, 'roomStatus'), activeSubject: ref(activeSubject), currentTest: ref(currentTest), latestResult: ref(latestResult), bugSummary: clone(bugSummary), goAttention: unique(goAttention), unknowns: unique(unknowns), importantEvidenceRefs: unique(importantEvidenceRefs), readyCandidates: unique(readyCandidates), nextAction: ref(nextAction), reportedAt: now() }); }
export function detectContradictions(reports = []) { const bySubject = new Map(); for (const report of reports) { const key = report.activeSubject || report.roomId; const value = report.latestResult || report.roomStatus; if (!bySubject.has(key)) bySubject.set(key, []); bySubject.get(key).push({ roomId: report.roomId, value }); } return [...bySubject.entries()].flatMap(([subjectRef, values]) => new Set(values.map((item) => item.value)).size > 1 ? [{ subjectRef, values, severity: 'CRITICAL', status: 'OPEN' }] : []); }
export function createMasterSelfTest({ selfTestId, checks = [], now = iso } = {}) { const normalized = checks.map((check) => ({ checkId: requireText(check.checkId, 'check.checkId'), status: statusOr(check.status), evidenceRefs: unique(check.evidenceRefs) })); return freeze({ selfTestId: requireText(selfTestId, 'selfTestId'), actor: PIXIE_ID, checks: normalized, status: normalized.some((x) => x.status === 'FAIL') ? 'FAIL' : normalized.some((x) => x.status === 'UNKNOWN') ? 'UNKNOWN' : 'PASS', createdAt: now() }); }
export function evaluateMasterGate({ selfTest, crossRoom = [], contradictions = [], criticalUnknowns = [] } = {}) { if (selfTest?.status === 'FAIL' || contradictions.length || crossRoom.some((x) => x.status === 'FAIL')) return { status: 'FAIL', reason: contradictions.length ? 'CONTRADICTION_DETECTED' : crossRoom.some((x) => x.status === 'FAIL') ? 'CROSS_ROOM_INCONSISTENCY' : 'PIXIE_01_SELF_TEST_FAIL' }; if (selfTest?.status === 'UNKNOWN' || criticalUnknowns.length || crossRoom.some((x) => x.status === 'UNKNOWN')) return { status: 'UNKNOWN', reason: 'CRITICAL_UNKNOWN' }; return { status: 'PASS', reason: null }; }

export function projectPixieBoard({ rooms = [], roomReports = [], activeSessions = [], tests = [], matrices = [], runs = [], bugs = [], goldenCases = [], attentions = [], unknowns = [], artifacts = [], proposals = [], passports = [], regressionAlerts = [], now = iso } = {}) { return freeze({ boardId: 'PIXIE-BOARD', projectionOnly: true, generatedBy: PIXIE_ID, generatedAt: now(), rooms: clone(rooms), roomReports: clone(roomReports), activeSessions: clone(activeSessions), tests: clone(tests), matrices: clone(matrices), testRuns: clone(runs), bugs: clone(bugs), goldenCases: clone(goldenCases), goAttention: clone(attentions), unknowns: unique(unknowns), artifacts: clone(artifacts), candidatePassports: clone(passports), regressionAlerts: clone(regressionAlerts), proposals: clone(proposals), counts: { rooms: rooms.length, activeSessions: activeSessions.length, tests: tests.length, matrices: matrices.length, testRuns: runs.length, bugs: bugs.length, goldenCases: goldenCases.length, goAttention: attentions.length, unknowns: unique(unknowns).length, artifacts: artifacts.length, candidatePassports: passports.length, regressionAlerts: regressionAlerts.length, proposals: proposals.length } }); }

export function createAccessGrant({ grantId, source, scope = [], access, roomId, sessionId, expiresAt, issuedBy, issuedAt = iso(), now = iso } = {}) { if (!ACCESS_TYPES.includes(access)) throw new Error(`External access must be one of: ${ACCESS_TYPES.join(', ')}`); return freeze({ grantId: requireText(grantId, 'grantId'), source: requireText(source, 'source'), scope: unique(scope), access, roomId: requireText(roomId, 'roomId'), sessionId: requireText(sessionId, 'sessionId'), expiresAt: requireText(expiresAt, 'expiresAt'), issuedBy: requireText(issuedBy, 'issuedBy'), issuedAt, status: 'ACTIVE', checkedAt: now() }); }
export function validateAccessGrant(grant, { roomId, sessionId, requiredScope, at = new Date().toISOString() } = {}) { if (!grant || grant.status !== 'ACTIVE') return { allowed: false, reason: 'GRANT_INACTIVE' }; if (grant.roomId !== roomId) return { allowed: false, reason: 'GRANT_ROOM_MISMATCH' }; if (grant.sessionId !== sessionId) return { allowed: false, reason: 'GRANT_SESSION_MISMATCH' }; if (Date.parse(grant.expiresAt) <= Date.parse(at)) return { allowed: false, reason: 'GRANT_EXPIRED' }; const missing = unique(requiredScope).filter((scope) => !grant.scope.includes(scope)); if (missing.length) return { allowed: false, reason: 'GRANT_SCOPE_MISSING', missingScope: missing }; return { allowed: true, reason: null }; }
export function importSnapshot({ snapshotId, source, sourceRevision, contentHash, data, grant, roomId, sessionId, requiredScope = ['SNAPSHOT'], now = iso } = {}) { const check = validateAccessGrant(grant, { roomId, sessionId, requiredScope, at: now() }); if (!check.allowed) throw new Error(check.reason); return freeze({ snapshotId: requireText(snapshotId, 'snapshotId'), source: requireText(source, 'source'), sourceRevision: requireText(sourceRevision, 'sourceRevision'), contentHash: requireText(contentHash, 'contentHash'), grantId: grant.grantId, roomId, sessionId, data: clone(data ?? null), ownership: 'LAB_OWNED_SNAPSHOT', importedAt: now() }); }

export function createCannonProfile({ profileId, matrixRef, requiredCategories = [], caseRefs = [], riskClass = 'STANDARD' } = {}) { const categories = unique(requiredCategories); const invalid = categories.filter((category) => !TEST_CATEGORIES.includes(category)); if (invalid.length) throw new Error(`Unsupported CANNON category: ${invalid.join(',')}`); return freeze({ profileId: requireText(profileId, 'profileId'), matrixRef: requireText(matrixRef, 'matrixRef'), requiredCategories: categories, caseRefs: unique(caseRefs), riskClass: requireText(riskClass, 'riskClass'), runnerStrategy: 'EXISTING_TEST_TYPE_RUNNERS' }); }
export function createCannonRun({ runId, profile, initiatedBy = PIXIE_ID, executedBy = PIXIE_ID, logicVersion, roomId = null, sourceRoomRefs = [], status = 'CANNON_RUNNING', evidenceRefs = [], unknowns = [], now = iso } = {}) { return createTestRun({ runId, runClass: 'CANNON', initiatedBy, executedBy, scope: sourceRoomRefs.length > 1 ? 'CROSS_ROOM' : 'LAB', purpose: 'FINAL_HEAVY_VERIFICATION', roomId, sourceRoomRefs, matrixRef: profile.matrixRef, logicVersion, status, evidenceRefs, unknowns, now }); }
export function createFactorySimulation({ simulationId, artifactRef, roomId, sessionId, now = iso } = {}) { return freeze({ simulationId: requireText(simulationId, 'simulationId'), artifactRef: requireText(artifactRef, 'artifactRef'), roomId: requireText(roomId, 'roomId'), sessionId: requireText(sessionId, 'sessionId'), stage: 'PLAN', status: 'SIMULATION_ONLY', outputs: [], evidenceRefs: [], updatedAt: now() }); }
export function advanceFactorySimulation(simulation, { stage, result, outputRef = null, evidenceRefs = [], now = iso } = {}) { const nextStage = requireText(stage, 'stage').toUpperCase(); if (!FACTORY_SIMULATION_STAGES.includes(nextStage)) throw new Error(`Unknown factory simulation stage: ${stage}`); const currentIndex = FACTORY_SIMULATION_STAGES.indexOf(simulation.stage); if (FACTORY_SIMULATION_STAGES.indexOf(nextStage) < currentIndex) throw new Error('Factory simulation cannot move backward without a new simulation'); return freeze({ ...clone(simulation), stage: nextStage, lastResult: requireText(result, 'result'), outputs: outputRef ? [...simulation.outputs, outputRef] : simulation.outputs, evidenceRefs: unique([...simulation.evidenceRefs, ...evidenceRefs]), status: 'SIMULATION_ONLY', updatedAt: now() }); }
export function createLearningProposal({ proposalId, proposedBy, assetType, sourceCycleId, sourceRunRefs = [], evidenceRefs = [], content, now = iso } = {}) { return freeze({ proposalId: requireText(proposalId, 'proposalId'), proposedBy: requireText(proposedBy, 'proposedBy'), assetType: requireText(assetType, 'assetType'), sourceCycleId: requireText(sourceCycleId, 'sourceCycleId'), sourceRunRefs: unique(sourceRunRefs), evidenceRefs: unique(evidenceRefs), content: clone(content ?? null), status: 'CANDIDATE', createdAt: now() }); }
export function promoteLearningProposal(proposal, { promotedBy = PIXIE_ID, status = 'ACTIVE', now = iso } = {}) { if (promotedBy !== PIXIE_ID) throw new Error('Only PIXIE-01 can promote Lab-wide learning'); return freeze({ ...clone(proposal), status, promotedBy, promotedAt: now() }); }
export function createWarp({ from, targetType, targetId, traceRefs = [], now = iso } = {}) { if (!LAB_WARP_TARGETS.includes(targetType)) throw new Error(`Unsupported Lab warp target: ${targetType}`); const target = requireText(targetId, 'targetId'); if (/^(https?:|drive:|github:|notion:)/i.test(target)) throw new Error('External warp is not allowed'); return freeze({ from: requireText(from, 'from'), targetType, targetId: target, traceRefs: unique(traceRefs), createdBy: PIXIE_ID, createdAt: now() }); }
export function createGuideAnswer({ question, answer, traceRefs = [], unknowns = [], nextAction = null } = {}) { return freeze({ question: requireText(question, 'question'), answer: requireText(answer, 'answer'), traceRefs: unique(traceRefs), unknowns: unique(unknowns), nextAction: ref(nextAction), answeredBy: PIXIE_ID }); }
export function assertNoModes(value) { const visit = (node, path = '$') => { if (!node || typeof node !== 'object') return; for (const [key, child] of Object.entries(node)) { if (key.toLowerCase() === 'mode') throw new Error(`MODE_FIELD_FORBIDDEN:${path}.${key}`); visit(child, `${path}.${key}`); } }; visit(value); return true; }
export function assertNoExternalAuthority(value) { const forbidden = ['write', 'delete', 'share', 'merge', 'deploy', 'production']; const found = []; const visit = (node) => { if (!node || typeof node !== 'object') return; for (const [key, child] of Object.entries(node)) { const normalized = key.toLowerCase(); if (child === true && forbidden.some((token) => normalized.includes(token))) found.push(normalized); visit(child); } }; visit(value); if (found.length) throw new Error(`EXTERNAL_AUTHORITY_FORBIDDEN:${found.join(',')}`); return true; }

export function createPersistenceAdapter({ load, save } = {}) { if (typeof load !== 'function' || typeof save !== 'function') throw new Error('Persistence adapter requires load and save'); return Object.freeze({ load, save }); }
export function createMemoryPersistence(initial = null) { let value = clone(initial); return createPersistenceAdapter({ async load() { return clone(value); }, async save(next) { value = clone(next); return clone(value); } }); }
