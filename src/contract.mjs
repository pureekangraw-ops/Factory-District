export const FACTORY_CONTRACT_VERSION = '0.1.0';

export const FACTORY_STATUS = Object.freeze({
  READY: 'READY',
  ACCEPTED: 'ACCEPTED',
  HANDOFF_VERIFIED: 'HANDOFF_VERIFIED',
  DENIED: 'DENIED',
  UNKNOWN: 'UNKNOWN',
  FAILED: 'FAILED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const FACTORY_VERIFICATION_SCOPE = Object.freeze({ BOUNDARY_HANDOFF: 'BOUNDARY_HANDOFF' });
export const FACTORY_DOMAINS = Object.freeze(['CODE', 'VISUAL', 'LOGIC']);
export const FACTORY_STATION_ID = 'FACTORY-STATION';
export const FACTORY_WORK_PASS_DESTINATION_ID = 'FACTORY_STATION';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new TypeError(`${name}_MUST_BE_NON_EMPTY_STRING_ARRAY`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}_MUST_BE_OBJECT`);
  return value;
}

function text(value) {
  return String(value ?? '').trim();
}

function rejectWorkPass(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function validateWorkPass({ workPass, workPassRef, workId, checkpointId } = {}) {
  const ref = text(workPassRef);
  if (!ref) rejectWorkPass('FACTORY_WORK_PASS_REF_REQUIRED');
  if (!workPass || typeof workPass !== 'object' || Array.isArray(workPass)) rejectWorkPass('FACTORY_WORK_PASS_REQUIRED');

  if (text(workPass.kind) !== 'WORK_PASS' || text(workPass.version) !== 'WORK_PASS_V1') {
    rejectWorkPass('FACTORY_WORK_PASS_VERSION_INVALID');
  }
  if (text(workPass.status) !== 'ACTIVE') rejectWorkPass('FACTORY_WORK_PASS_INACTIVE');
  if (text(workPass.actor) !== 'GO') rejectWorkPass('FACTORY_WORK_PASS_ACTOR_INVALID');

  if (text(workPass.workId) !== text(workId) || text(workPass.checkpointId) !== text(checkpointId)) {
    rejectWorkPass('FACTORY_WORK_PASS_SCOPE_MISMATCH');
  }

  const actions = Array.isArray(workPass.permissions?.actions)
    ? workPass.permissions.actions.map(text)
    : [];
  if (!actions.includes('handoff')) rejectWorkPass('FACTORY_WORK_PASS_ACTION_DENIED');

  const destinations = Array.isArray(workPass.permissions?.handoff) ? workPass.permissions.handoff : [];
  if (!destinations.some((rule) => text(rule?.stationId) === FACTORY_WORK_PASS_DESTINATION_ID)) {
    rejectWorkPass('FACTORY_WORK_PASS_DESTINATION_DENIED');
  }

  const passId = text(workPass.passId);
  if (!passId || ref !== `work-pass://${passId}`) rejectWorkPass('FACTORY_WORK_PASS_REF_MISMATCH');
  if (workPass.authorityTransferred === true) rejectWorkPass('FACTORY_WORK_PASS_AUTHORITY_TRANSFER_INVALID');

  return Object.freeze({
    workPassRef: ref,
    passId,
    actor: 'GO',
    destinationId: FACTORY_WORK_PASS_DESTINATION_ID,
    validated: true,
  });
}

export function createHandoff(input = {}) {
  const source = object(input.source, 'source');
  const target = object(input.target, 'target');
  const workId = requiredString(input.workId, 'workId');
  const checkpointId = requiredString(input.checkpointId, 'checkpointId');
  const ownerDomain = requiredString(input.ownerDomain, 'ownerDomain').toUpperCase();
  if (!FACTORY_DOMAINS.includes(ownerDomain)) throw new TypeError('ownerDomain_INVALID');
  if (requiredString(target.stationId, 'target.stationId') !== FACTORY_STATION_ID) throw new Error('TARGET_MUST_BE_FACTORY_STATION');
  if (requiredString(target.component, 'target.component') !== 'FACTORY_HALL') throw new Error('TARGET_MUST_BE_FACTORY_HALL');
  if (Object.hasOwn(input, 'credential') || Object.hasOwn(input, 'token') || Object.hasOwn(input, 'secret')) {
    throw new Error('HANDOFF_MUST_NOT_CARRY_CREDENTIALS');
  }

  const validatedPass = validateWorkPass({
    workPass: input.workPass,
    workPassRef: input.workPassRef,
    workId,
    checkpointId,
  });

  return Object.freeze({
    kind: 'FACTORY_HANDOFF',
    contractVersion: FACTORY_CONTRACT_VERSION,
    workId,
    checkpointId,
    workPassRef: validatedPass.workPassRef,
    source: Object.freeze({
      stationId: requiredString(source.stationId, 'source.stationId'),
      system: requiredString(source.system, 'source.system'),
    }),
    target: Object.freeze({
      stationId: requiredString(target.stationId, 'target.stationId'),
      system: requiredString(target.system, 'target.system'),
      component: requiredString(target.component, 'target.component'),
    }),
    ownerDomain,
    intent: requiredString(input.intent, 'intent'),
    scope: stringArray(input.scope, 'scope'),
    inputRefs: Object.freeze(Array.isArray(input.inputRefs) ? [...input.inputRefs] : []),
    expectedSourceSha: input.expectedSourceSha == null ? null : requiredString(input.expectedSourceSha, 'expectedSourceSha'),
    requestedAt: requiredString(input.requestedAt, 'requestedAt'),
  });
}

export function createReceipt({ receiptId, handoff, status, acceptedAt, outcome = null, evidenceRef = null, verificationScope = null, domainCompleted = false, reason = null }) {
  return Object.freeze({
    kind: 'FACTORY_RECEIPT',
    contractVersion: FACTORY_CONTRACT_VERSION,
    receiptId: requiredString(receiptId, 'receiptId'),
    workId: handoff.workId,
    checkpointId: handoff.checkpointId,
    workPassRef: handoff.workPassRef,
    stationId: FACTORY_STATION_ID,
    status: requiredString(status, 'status'),
    outcome,
    evidenceRef,
    verificationScope,
    domainCompleted,
    reason,
    acceptedAt: requiredString(acceptedAt, 'acceptedAt'),
  });
}

export function createEvidence({ evidenceRef, handoff, observedAt, sourceSha, verificationScope, details = {} }) {
  return Object.freeze({
    kind: 'FACTORY_EVIDENCE',
    evidenceRef: requiredString(evidenceRef, 'evidenceRef'),
    workId: handoff.workId,
    checkpointId: handoff.checkpointId,
    workPassRef: handoff.workPassRef,
    ownerDomain: handoff.ownerDomain,
    sourceSha: requiredString(sourceSha, 'sourceSha'),
    verificationScope: requiredString(verificationScope, 'verificationScope'),
    observedAt: requiredString(observedAt, 'observedAt'),
    details: Object.freeze({ ...details }),
  });
}
