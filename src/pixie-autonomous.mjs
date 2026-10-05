import { FAILURE_CLASS } from './machine-contract.mjs';

export const PIXIE_PHASE = Object.freeze({ RECEIVE: 'RECEIVE', SELECT: 'SELECT', EXECUTE: 'EXECUTE', OBSERVE: 'OBSERVE', RECOVER: 'RECOVER', VERIFY: 'VERIFY', RETURN: 'RETURN' });

function completed(result) {
  return result?.run?.returnState === 'RETURNED' || result?.run?.executionState === 'COMPLETE' || result?.lifecycleStatus === 'COMPLETE';
}

function blocked(result) {
  return result?.authorityBoundary === true || result?.run?.executionState === 'BLOCKED' || result?.status === 'BLOCKED';
}

export function createPixieOperator({ domainRunners = {}, clock = () => new Date().toISOString(), maxAttempts = 1 } = {}) {
  return Object.freeze({
    async run({ work, domain, machineId, authorityRef } = {}) {
      const events = [{ phase: PIXIE_PHASE.RECEIVE, at: clock(), workId: work?.workId || null }];
      const normalizedDomain = String(domain || '').toUpperCase();
      const runner = domainRunners[normalizedDomain];
      events.push({ phase: PIXIE_PHASE.SELECT, at: clock(), domain: normalizedDomain, machineId: machineId || null });
      if (typeof runner !== 'function') return { status: 'UNKNOWN', lifecycleStatus: 'UNKNOWN', attempts: 0, events, failure: { class: FAILURE_CLASS.DESTINATION_UNAVAILABLE, code: 'MACHINE_NOT_REGISTERED' } };
      let attempts = 0;
      let lastResult;
      while (attempts < Math.max(1, maxAttempts)) {
        attempts += 1;
        try {
          events.push({ phase: PIXIE_PHASE.EXECUTE, at: clock(), attempt: attempts });
          lastResult = await runner({ work, actorRef: 'PIXIE', authorityRef, attempt: attempts });
          events.push({ phase: PIXIE_PHASE.OBSERVE, at: clock(), attempt: attempts, executionState: lastResult?.run?.executionState || 'UNKNOWN' });
          if (blocked(lastResult)) {
            events.push({ phase: PIXIE_PHASE.RETURN, at: clock(), status: 'BLOCKED', attempt: attempts });
            return { status: 'BLOCKED', lifecycleStatus: 'BLOCKED', domain: normalizedDomain, machineId, attempts, events, result: lastResult, failure: { class: FAILURE_CLASS.AUTHORITY_DENIED, code: 'AUTHORITY_BOUNDARY' } };
          }
          if (completed(lastResult)) {
            events.push({ phase: PIXIE_PHASE.VERIFY, at: clock(), attempt: attempts, status: 'COMPLETE' });
            events.push({ phase: PIXIE_PHASE.RETURN, at: clock(), status: 'RETURNED', attempt: attempts });
            return { status: 'RETURNED', lifecycleStatus: 'COMPLETE', domain: normalizedDomain, machineId, attempts, events, result: lastResult };
          }
          const retryable = lastResult?.retryable === true;
          if (!retryable || attempts >= maxAttempts) break;
          events.push({ phase: PIXIE_PHASE.RECOVER, at: clock(), attempt: attempts, reason: 'RETRYABLE_RESULT' });
        } catch (error) {
          const retryable = error.retryable === true;
          lastResult = { error: { code: error.code || 'PIXIE_MACHINE_ERROR', message: error.message } };
          events.push({ phase: PIXIE_PHASE.OBSERVE, at: clock(), attempt: attempts, executionState: 'UNKNOWN' });
          if (!retryable || attempts >= maxAttempts) break;
          events.push({ phase: PIXIE_PHASE.RECOVER, at: clock(), attempt: attempts, reason: 'RETRYABLE_ERROR' });
        }
      }
      events.push({ phase: PIXIE_PHASE.RETURN, at: clock(), status: 'UNKNOWN', attempt: attempts });
      return { status: 'UNKNOWN', lifecycleStatus: 'UNKNOWN', domain: normalizedDomain, machineId, attempts, events, result: lastResult, failure: { class: FAILURE_CLASS.UNKNOWN, code: 'PIXIE_EXECUTION_UNVERIFIED' } };
    },
  });
}
