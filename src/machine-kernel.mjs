import {
  CHECKPOINT,
  createAttempt,
  createMachineRun,
  EXECUTION_STATE,
  FAILURE_CLASS,
  RETURN_STATE,
  SUBJECT_ASSESSMENT,
} from './machine-contract.mjs';
import { assertExecutionTransition, assertReturnTransition } from './machine-state.mjs';
import { assertPersistenceAdapter } from './persistence.mjs';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function id(idFactory, prefix) {
  return `${prefix}-${idFactory()}`;
}

function executionFailureState(failureClass) {
  return failureClass === FAILURE_CLASS.AUTHORITY_DENIED || failureClass === FAILURE_CLASS.VERSION_MISMATCH
    ? EXECUTION_STATE.BLOCKED
    : failureClass === FAILURE_CLASS.PERSISTENCE_ERROR
      ? EXECUTION_STATE.UNKNOWN
      : EXECUTION_STATE.FAILED;
}

export function createMachineKernel({ persistence, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID() } = {}) {
  const store = assertPersistenceAdapter(persistence);

  async function load(runId) {
    const run = await store.loadRun(requiredString(runId, 'runId'));
    if (!run) throw new Error('RUN_NOT_FOUND');
    return run;
  }

  async function advanceExecution(run, toState, patch = {}, actorRef = 'machine-kernel') {
    assertExecutionTransition(run.executionState, toState);
    return store.transitionRun({
      axis: 'execution',
      runId: run.runId,
      expectedSequence: run.sequence,
      toState,
      patch: { ...patch, updatedAt: clock() },
      eventId: id(idFactory, 'event'),
      actorRef,
      at: clock(),
    });
  }

  async function advanceReturn(run, toState, patch = {}, actorRef = 'machine-kernel') {
    assertReturnTransition(run.returnState, toState);
    return store.transitionRun({
      axis: 'return',
      runId: run.runId,
      expectedSequence: run.sequence,
      toState,
      patch: { ...patch, updatedAt: clock() },
      eventId: id(idFactory, 'event'),
      actorRef,
      at: clock(),
    });
  }

  async function receive(input = {}) {
    const run = createMachineRun({
      ...input,
      runId: input.runId || id(idFactory, 'run'),
      createdAt: input.createdAt || clock(),
    });
    return store.createRun(run);
  }

  async function interpret(runId, { planRef = null, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (run.executionState !== EXECUTION_STATE.RECEIVED) throw new Error('INTERPRET_REQUIRES_RECEIVED');
    return advanceExecution(run, EXECUTION_STATE.INTERPRETED, { checkpointId: CHECKPOINT.INTERPRET, planRef }, actorRef);
  }

  async function startAttempt(runId, { executorRef, inputSnapshotRef = null, reason = 'INITIAL', actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (run.executionState !== EXECUTION_STATE.INTERPRETED) throw new Error('ATTEMPT_REQUIRES_INTERPRETED');
    const attempts = await store.listAttempts(runId);
    const attempt = createAttempt({
      attemptId: id(idFactory, 'attempt'),
      runId,
      parentAttemptId: attempts.at(-1)?.attemptId || null,
      ordinal: attempts.length + 1,
      reason,
      executorRef: requiredString(executorRef, 'executorRef'),
      inputSnapshotRef,
      startedAt: clock(),
    });
    return store.startAttempt({
      runId,
      expectedSequence: run.sequence,
      attempt,
      checkpointId: CHECKPOINT.EXECUTE,
      eventId: id(idFactory, 'event'),
      actorRef,
      at: clock(),
    });
  }

  async function heartbeat(runId, data = {}) {
    const run = await load(runId);
    if (![EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(run.executionState)) throw new Error('HEARTBEAT_REQUIRES_ACTIVE_EXECUTION');
    return store.appendHeartbeat({
      heartbeatId: id(idFactory, 'heartbeat'),
      runId,
      attemptId: run.attemptId,
      sequence: data.sequence,
      phase: data.phase || run.executionState,
      status: data.status || 'ALIVE',
      progress: data.progress ?? null,
      observedAt: clock(),
      leaseUntil: data.leaseUntil || null,
      currentAction: data.currentAction || null,
    });
  }

  async function beginVerification(runId, { actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (run.executionState !== EXECUTION_STATE.EXECUTING) throw new Error('VERIFY_REQUIRES_EXECUTING');
    return advanceExecution(run, EXECUTION_STATE.VERIFYING, { checkpointId: CHECKPOINT.VERIFY }, actorRef);
  }

  async function verify(runId, { evidence = [], versionGate, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (run.executionState !== EXECUTION_STATE.VERIFYING) throw new Error('VERIFY_REQUIRES_VERIFYING');
    if (!versionGate || typeof versionGate !== 'object') throw new TypeError('versionGate_REQUIRED');
    const evidenceRefs = [];
    for (const item of evidence) {
      const saved = await store.appendEvidence({
        ...item,
        evidenceId: item.evidenceId || id(idFactory, 'evidence'),
        runId,
        attemptId: run.attemptId,
        capturedAt: item.capturedAt || clock(),
      });
      evidenceRefs.push(saved.evidenceId);
    }
    const gate = await store.recordVersionGate({
      ...versionGate,
      versionGateId: versionGate.versionGateId || id(idFactory, 'gate'),
      runId,
      decidedAt: versionGate.decidedAt || clock(),
    });
    if (gate.status === 'PASS' && evidenceRefs.length > 0) {
      return advanceExecution(run, EXECUTION_STATE.COMPLETE, {
        checkpointId: CHECKPOINT.VERIFY,
        evidenceRefs,
        versionGateRef: gate.versionGateId,
      }, actorRef);
    }
    const failure = await recordFailure(run, {
      class: gate.status === 'FAIL' ? FAILURE_CLASS.VERSION_MISMATCH : FAILURE_CLASS.VERIFICATION_FAILED,
      code: gate.status === 'FAIL' ? 'VERSION_GATE_FAILED' : 'VERIFICATION_EVIDENCE_INCOMPLETE',
      message: gate.reason || 'Verification did not produce a complete proof',
      retryable: false,
      safeToRetry: false,
      requiresManual: gate.status === 'FAIL',
      confidence: gate.status === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED',
    }, actorRef, gate.status === 'FAIL' ? EXECUTION_STATE.BLOCKED : EXECUTION_STATE.UNKNOWN);
    return failure;
  }

  async function recordFailure(run, failureInput, actorRef = 'machine-kernel', targetState = null) {
    const failure = await store.recordFailure({
      ...failureInput,
      failureId: failureInput.failureId || id(idFactory, 'failure'),
      runId: run.runId,
      attemptId: run.attemptId,
      observedAt: failureInput.observedAt || clock(),
    });
    const nextState = targetState || executionFailureState(failure.class);
    return advanceExecution(run, nextState, { failureRefs: [...run.failureRefs, failure.failureId] }, actorRef);
  }

  async function requestCancel(runId, { requestedBy, authorityRef, reason, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (![EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(run.executionState)) throw new Error('CANCEL_REQUIRES_ACTIVE_EXECUTION');
    const cancellation = await store.recordCancellation({
      cancellationId: id(idFactory, 'cancel'),
      runId,
      attemptId: run.attemptId,
      requestedBy: requiredString(requestedBy, 'requestedBy'),
      authorityRef: requiredString(authorityRef, 'authorityRef'),
      reason: requiredString(reason, 'reason'),
      status: 'REQUESTED',
      requestedAt: clock(),
      stopEvidenceRefs: [],
    });
    return advanceExecution(run, EXECUTION_STATE.CANCELLING, { cancellationRef: cancellation.cancellationId }, actorRef);
  }

  async function confirmCancellation(runId, { stopEvidence = [], actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (run.executionState !== EXECUTION_STATE.CANCELLING) throw new Error('CANCEL_CONFIRM_REQUIRES_CANCELLING');
    const evidenceRefs = [];
    for (const item of stopEvidence) {
      const saved = await store.appendEvidence({
        ...item,
        evidenceId: item.evidenceId || id(idFactory, 'evidence'),
        runId,
        attemptId: run.attemptId,
        capturedAt: item.capturedAt || clock(),
      });
      evidenceRefs.push(saved.evidenceId);
    }
    const cancellation = await store.recordCancellation({
      cancellationId: run.cancellationRef,
      runId,
      attemptId: run.attemptId,
      status: evidenceRefs.length > 0 ? 'VERIFIED' : 'UNKNOWN',
      verifiedAt: clock(),
      stopEvidenceRefs: evidenceRefs,
    });
    return advanceExecution(run, evidenceRefs.length > 0 ? EXECUTION_STATE.CANCELLED : EXECUTION_STATE.UNKNOWN, {
      cancellationRef: cancellation.cancellationId,
      evidenceRefs: [...run.evidenceRefs, ...evidenceRefs],
    }, actorRef);
  }

  async function resume(runId, { authorityRef, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (![EXECUTION_STATE.BLOCKED, EXECUTION_STATE.FAILED, EXECUTION_STATE.UNKNOWN].includes(run.executionState)) throw new Error('RESUME_REQUIRES_RECOVERY_STATE');
    requiredString(authorityRef, 'authorityRef');
    return advanceExecution(run, EXECUTION_STATE.INTERPRETED, { checkpointId: CHECKPOINT.INTERPRET, resumedBy: authorityRef }, actorRef);
  }

  async function assessSubject(runId, { status, ownerDecisionRef = null, evidenceRefs = [] } = {}) {
    const run = await load(runId);
    if (!Object.values(SUBJECT_ASSESSMENT).includes(status)) throw new Error('SUBJECT_ASSESSMENT_INVALID');
    if (status !== SUBJECT_ASSESSMENT.NOT_ASSESSED && !ownerDecisionRef) throw new Error('OWNER_DECISION_REQUIRED');
    return store.transitionRun({
      axis: 'execution',
      runId,
      expectedSequence: run.sequence,
      toState: run.executionState,
      patch: { subjectAssessment: { status, ownerDecisionRef, evidenceRefs }, updatedAt: clock() },
      eventId: id(idFactory, 'event'),
      actorRef: ownerDecisionRef || 'machine-kernel',
      at: clock(),
    });
  }

  async function returnRun(runId, { resultRefs = [], evidenceRefs = [], boundaryStatus = 'HANDOFF_VERIFIED', nextAction = null, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if ([EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING, EXECUTION_STATE.CANCELLING].includes(run.executionState)) throw new Error('RETURN_REQUIRES_SETTLED_EXECUTION');
    const returnRecord = await store.recordReturn({
      returnId: id(idFactory, 'return'),
      runId,
      expectedSequence: run.sequence,
      state: RETURN_STATE.RETURNED,
      status: run.executionState,
      boundaryStatus,
      resultRefs,
      evidenceRefs,
      nextAction,
      returnedAt: clock(),
    });
    return returnRecord.run;
  }

  async function failReturn(runId, { reason, actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    const returnRecord = await store.recordReturn({
      returnId: id(idFactory, 'return'),
      runId,
      expectedSequence: run.sequence,
      state: RETURN_STATE.FAILED,
      status: run.executionState,
      reason: requiredString(reason, 'reason'),
      returnedAt: clock(),
    });
    return returnRecord.run;
  }

  async function retryReturn(runId, { actorRef = 'machine-kernel' } = {}) {
    const run = await load(runId);
    if (![RETURN_STATE.FAILED, RETURN_STATE.UNKNOWN].includes(run.returnState)) throw new Error('RETURN_RETRY_REQUIRES_FAILED_OR_UNKNOWN');
    return advanceReturn(run, RETURN_STATE.PENDING, { returnRef: null }, actorRef);
  }

  return Object.freeze({
    receive,
    load,
    interpret,
    startAttempt,
    heartbeat,
    beginVerification,
    verify,
    recordFailure,
    requestCancel,
    confirmCancellation,
    resume,
    assessSubject,
    returnRun,
    failReturn,
    retryReturn,
  });
}
