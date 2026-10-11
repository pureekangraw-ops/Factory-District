import { FAILURE_CLASS } from './machine-contract.mjs';

export const DWARF_PHASE = Object.freeze({
  RECEIVE: 'RECEIVE',
  SELECT: 'SELECT',
  EXECUTE: 'EXECUTE',
  OBSERVE: 'OBSERVE',
  RECOVER: 'RECOVER',
  VERIFY: 'VERIFY',
  RETURN: 'RETURN',
});

const MAX_DWARF_ATTEMPTS = 3;
const text = value => typeof value === 'string' ? value.trim() : '';

function hasVerifiedWorkContext(run, workId, checkpointId) {
  return run?.workId === workId && run?.workCheckpointId === checkpointId;
}

function hasCompletionEvidence(run) {
  return text(run?.verificationRef) !== ''
    && text(run?.returnRef) !== ''
    && Array.isArray(run?.evidenceRefs)
    && run.evidenceRefs.length > 0
    && run.evidenceRefs.every(ref => text(ref) !== '');
}

function completed(result, workId, checkpointId) {
  const run = result?.run;
  return run?.executionState === 'COMPLETE'
    && run?.returnState === 'RETURNED'
    && hasVerifiedWorkContext(run, workId, checkpointId)
    && hasCompletionEvidence(run);
}

function blocked(result) {
  return result?.authorityBoundary === true
    || result?.run?.executionState === 'BLOCKED'
    || result?.status === 'BLOCKED';
}

function contextFailure(result, workId, checkpointId) {
  const run = result?.run;
  if (!run || typeof run !== 'object') return null;
  if (!text(run.workId) || !text(run.workCheckpointId)) {
    return {
      class: FAILURE_CLASS.VERIFICATION_FAILED,
      code: 'DWARF_RESULT_CONTEXT_UNVERIFIED',
    };
  }
  if (!hasVerifiedWorkContext(run, workId, checkpointId)) {
    return {
      class: FAILURE_CLASS.VERIFICATION_FAILED,
      code: 'DWARF_RESULT_CONTEXT_MISMATCH',
    };
  }
  return null;
}

export function createDwarfOperator({
  domainRunners = {},
  clock = () => new Date().toISOString(),
  maxAttempts = MAX_DWARF_ATTEMPTS,
} = {}) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_DWARF_ATTEMPTS) {
    throw new TypeError('DWARF_MAX_ATTEMPTS_INVALID');
  }

  return Object.freeze({
    async run({ work, domain, machineId, authorityRef } = {}) {
      const workId = text(work?.workId);
      const checkpointId = text(work?.checkpointId);
      const events = [{
        phase: DWARF_PHASE.RECEIVE,
        at: clock(),
        workId: workId || null,
        checkpointId: checkpointId || null,
      }];
      const normalizedDomain = String(domain || '').toUpperCase();

      if (!workId || !checkpointId) {
        events.push({ phase: DWARF_PHASE.RETURN, at: clock(), status: 'UNKNOWN', attempt: 0 });
        return {
          status: 'UNKNOWN',
          lifecycleStatus: 'UNKNOWN',
          attempts: 0,
          events,
          failure: { class: FAILURE_CLASS.INPUT_INVALID, code: 'DWARF_WORK_CONTEXT_INVALID' },
        };
      }

      const runner = domainRunners[normalizedDomain];
      events.push({
        phase: DWARF_PHASE.SELECT,
        at: clock(),
        domain: normalizedDomain,
        machineId: machineId || null,
        workId,
        checkpointId,
      });
      if (typeof runner !== 'function') {
        return {
          status: 'UNKNOWN',
          lifecycleStatus: 'UNKNOWN',
          attempts: 0,
          events,
          failure: {
            class: FAILURE_CLASS.DESTINATION_UNAVAILABLE,
            code: 'MACHINE_NOT_REGISTERED',
          },
        };
      }

      let attempts = 0;
      let lastResult;
      while (attempts < maxAttempts) {
        attempts += 1;
        try {
          events.push({
            phase: DWARF_PHASE.EXECUTE,
            at: clock(),
            attempt: attempts,
            workId,
            checkpointId,
          });
          lastResult = await runner({
            work,
            actorRef: 'DWARF-01',
            authorityRef,
            attempt: attempts,
          });
        } catch (error) {
          lastResult = {
            error: { code: error?.code || 'DWARF_MACHINE_ERROR', message: error?.message || '' },
          };
          events.push({
            phase: DWARF_PHASE.OBSERVE,
            at: clock(),
            attempt: attempts,
            executionState: 'UNKNOWN',
          });
          // Use the existing safeToRetry signal; retryable alone does not prove
          // that a prior tool side effect is absent or idempotent.
          if (error?.retryable !== true || error?.safeToRetry !== true || attempts >= maxAttempts) break;
          events.push({
            phase: DWARF_PHASE.RECOVER,
            at: clock(),
            attempt: attempts,
            reason: 'SAFE_RETRY_CONFIRMED',
          });
          continue;
        }

        events.push({
          phase: DWARF_PHASE.OBSERVE,
          at: clock(),
          attempt: attempts,
          executionState: lastResult?.run?.executionState || 'UNKNOWN',
        });

        if (blocked(lastResult)) {
          events.push({ phase: DWARF_PHASE.RETURN, at: clock(), status: 'BLOCKED', attempt: attempts });
          return {
            status: 'BLOCKED',
            lifecycleStatus: 'BLOCKED',
            domain: normalizedDomain,
            machineId,
            attempts,
            events,
            result: lastResult,
            failure: { class: FAILURE_CLASS.AUTHORITY_DENIED, code: 'AUTHORITY_BOUNDARY' },
          };
        }

        const contextError = contextFailure(lastResult, workId, checkpointId);
        if (contextError) {
          events.push({ phase: DWARF_PHASE.RETURN, at: clock(), status: 'UNKNOWN', attempt: attempts });
          return {
            status: 'UNKNOWN',
            lifecycleStatus: 'UNKNOWN',
            domain: normalizedDomain,
            machineId,
            attempts,
            events,
            result: lastResult,
            failure: contextError,
          };
        }

        if (completed(lastResult, workId, checkpointId)) {
          events.push({ phase: DWARF_PHASE.VERIFY, at: clock(), attempt: attempts, status: 'COMPLETE' });
          events.push({ phase: DWARF_PHASE.RETURN, at: clock(), status: 'RETURNED', attempt: attempts });
          return {
            status: 'RETURNED',
            lifecycleStatus: 'COMPLETE',
            domain: normalizedDomain,
            machineId,
            attempts,
            events,
            result: lastResult,
          };
        }

        if (lastResult?.retryable !== true || lastResult?.safeToRetry !== true || attempts >= maxAttempts) break;
        events.push({
          phase: DWARF_PHASE.RECOVER,
          at: clock(),
          attempt: attempts,
          reason: 'SAFE_RETRY_CONFIRMED',
        });
      }

      events.push({ phase: DWARF_PHASE.RETURN, at: clock(), status: 'UNKNOWN', attempt: attempts });
      return {
        status: 'UNKNOWN',
        lifecycleStatus: 'UNKNOWN',
        domain: normalizedDomain,
        machineId,
        attempts,
        events,
        result: lastResult,
        failure: { class: FAILURE_CLASS.INTERNAL_ERROR, code: 'DWARF_EXECUTION_UNVERIFIED' },
      };
    },
  });
}
