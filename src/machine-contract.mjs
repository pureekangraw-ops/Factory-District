export const MACHINE_CONTRACT_VERSION = '0.1.0';

export const EXECUTION_STATE = Object.freeze({
  RECEIVED: 'RECEIVED',
  INTERPRETED: 'INTERPRETED',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
  CANCELLING: 'CANCELLING',
  CANCELLED: 'CANCELLED',
});

export const RETURN_STATE = Object.freeze({
  PENDING: 'PENDING',
  RETURNED: 'RETURNED',
  FAILED: 'FAILED',
  UNKNOWN: 'UNKNOWN',
});

export const CHECKPOINT = Object.freeze({
  RECEIVE: 'CP-01',
  INTERPRET: 'CP-02',
  EXECUTE: 'CP-03',
  VERIFY: 'CP-04',
  RETURN: 'CP-05',
});

export const FAILURE_CLASS = Object.freeze({
  INPUT_INVALID: 'INPUT_INVALID',
  AUTHORITY_DENIED: 'AUTHORITY_DENIED',
  DESTINATION_UNAVAILABLE: 'DESTINATION_UNAVAILABLE',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  TIMEOUT: 'TIMEOUT',
  HEARTBEAT_LOST: 'HEARTBEAT_LOST',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  PERSISTENCE_ERROR: 'PERSISTENCE_ERROR',
  CANCELLED: 'CANCELLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export const SUBJECT_ASSESSMENT = Object.freeze({
  NOT_ASSESSED: 'NOT_ASSESSED',
  EXPERIMENTAL: 'EXPERIMENTAL',
  QUALIFIED: 'QUALIFIED',
  REJECTED: 'REJECTED',
  UNKNOWN: 'UNKNOWN',
});

export const VERIFICATION_SCOPE = Object.freeze({
  BOUNDARY_HANDOFF: 'BOUNDARY_HANDOFF',
  EXECUTION: 'EXECUTION',
  ARTIFACT: 'ARTIFACT',
  DEPLOYMENT: 'DEPLOYMENT',
  RUNTIME: 'RUNTIME',
  OWNER_DOMAIN: 'OWNER_DOMAIN',
  VERSION: 'VERSION',
});

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}_MUST_BE_OBJECT`);
  return value;
}

function stringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new TypeError(`${name}_MUST_BE_STRING_ARRAY`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

export function createMachineRun(input = {}) {
  const ingress = object(input.ingress, 'ingress');
  const destination = object(input.destination, 'destination');
  const transportRef = object(input.transportRef, 'transportRef');
  const requestedBy = object(input.requestedBy, 'requestedBy');
  const subject = object(input.subject, 'subject');
  return Object.freeze({
    kind: 'MACHINE_RUN',
    contractVersion: MACHINE_CONTRACT_VERSION,
    runId: requiredString(input.runId, 'runId'),
    workId: requiredString(input.workId, 'workId'),
    machineId: requiredString(input.machineId, 'machineId'),
    machineVersion: requiredString(input.machineVersion, 'machineVersion'),
    domain: requiredString(input.domain, 'domain').toUpperCase(),
    executionState: EXECUTION_STATE.RECEIVED,
    returnState: RETURN_STATE.PENDING,
    checkpointId: CHECKPOINT.RECEIVE,
    attemptId: null,
    ingress: Object.freeze({
      systemId: requiredString(ingress.systemId, 'ingress.systemId'),
      surfaceType: requiredString(ingress.surfaceType, 'ingress.surfaceType'),
      surfaceId: requiredString(ingress.surfaceId, 'ingress.surfaceId'),
    }),
    destination: Object.freeze({
      systemId: requiredString(destination.systemId, 'destination.systemId'),
      surfaceType: requiredString(destination.surfaceType, 'destination.surfaceType'),
      surfaceId: requiredString(destination.surfaceId, 'destination.surfaceId'),
      ownerDomain: requiredString(destination.ownerDomain, 'destination.ownerDomain').toUpperCase(),
    }),
    transportRef: Object.freeze({
      kind: requiredString(transportRef.kind, 'transportRef.kind'),
      linkId: requiredString(transportRef.linkId, 'transportRef.linkId'),
      trustBoundaryRef: requiredString(transportRef.trustBoundaryRef, 'transportRef.trustBoundaryRef'),
    }),
    requestedBy: Object.freeze({
      actorId: requiredString(requestedBy.actorId, 'requestedBy.actorId'),
      authorityRef: requiredString(requestedBy.authorityRef, 'requestedBy.authorityRef'),
      requestedAt: requiredString(requestedBy.requestedAt, 'requestedBy.requestedAt'),
    }),
    subject: Object.freeze({
      subjectId: requiredString(subject.subjectId, 'subject.subjectId'),
      subjectType: requiredString(subject.subjectType, 'subject.subjectType'),
      ownerSystem: requiredString(subject.ownerSystem, 'subject.ownerSystem'),
      lifecycleAuthorityRef: requiredString(subject.lifecycleAuthorityRef, 'subject.lifecycleAuthorityRef'),
    }),
    subjectAssessment: Object.freeze({
      status: SUBJECT_ASSESSMENT.NOT_ASSESSED,
      ownerDecisionRef: null,
      evidenceRefs: Object.freeze([]),
    }),
    inputRefs: stringArray(input.inputRefs || [], 'inputRefs'),
    outputRefs: Object.freeze([]),
    evidenceRefs: Object.freeze([]),
    failureRefs: Object.freeze([]),
    cancellationRef: null,
    versionGateRef: null,
    returnRef: null,
    sequence: 0,
    createdAt: requiredString(input.createdAt, 'createdAt'),
    updatedAt: requiredString(input.createdAt, 'createdAt'),
  });
}

export function createAttempt(input = {}) {
  return Object.freeze({
    kind: 'MACHINE_ATTEMPT',
    attemptId: requiredString(input.attemptId, 'attemptId'),
    runId: requiredString(input.runId, 'runId'),
    parentAttemptId: input.parentAttemptId == null ? null : requiredString(input.parentAttemptId, 'parentAttemptId'),
    ordinal: Number.isInteger(input.ordinal) && input.ordinal > 0 ? input.ordinal : 1,
    reason: requiredString(input.reason || 'INITIAL', 'reason'),
    state: 'STARTED',
    executorRef: requiredString(input.executorRef, 'executorRef'),
    inputSnapshotRef: input.inputSnapshotRef == null ? null : requiredString(input.inputSnapshotRef, 'inputSnapshotRef'),
    outputRefs: Object.freeze([]),
    startedAt: requiredString(input.startedAt, 'startedAt'),
    endedAt: null,
    lastHeartbeatAt: requiredString(input.startedAt, 'startedAt'),
    retryable: false,
    safeToRetry: false,
    budgetConsumed: 0,
    failureRef: null,
    evidenceRefs: Object.freeze([]),
  });
}
