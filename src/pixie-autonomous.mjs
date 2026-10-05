import { FAILURE_CLASS } from './machine-contract.mjs';

export const PIXIE_PHASE = Object.freeze({ RECEIVE: 'RECEIVE', SELECT: 'SELECT', EXECUTE: 'EXECUTE', OBSERVE: 'OBSERVE', RETURN: 'RETURN' });

export function createPixieOperator({ domainRunners = {}, clock = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    async run({ work, domain, machineId, authorityRef } = {}) {
      const events = [{ phase: PIXIE_PHASE.RECEIVE, at: clock(), workId: work?.workId || null }];
      const normalizedDomain = String(domain || '').toUpperCase();
      const runner = domainRunners[normalizedDomain];
      events.push({ phase: PIXIE_PHASE.SELECT, at: clock(), domain: normalizedDomain, machineId: machineId || null });
      if (typeof runner !== 'function') return { status: 'UNKNOWN', events, failure: { class: FAILURE_CLASS.DESTINATION_UNAVAILABLE, code: 'MACHINE_NOT_REGISTERED' } };
      try {
        events.push({ phase: PIXIE_PHASE.EXECUTE, at: clock() });
        const result = await runner({ work, actorRef: 'PIXIE', authorityRef });
        events.push({ phase: PIXIE_PHASE.OBSERVE, at: clock(), executionState: result?.run?.executionState || 'UNKNOWN' });
        const status = result?.run?.returnState === 'RETURNED' ? 'RETURNED' : result?.run?.executionState === 'BLOCKED' ? 'BLOCKED' : result?.run?.executionState === 'UNKNOWN' ? 'UNKNOWN' : 'RETURNED';
        events.push({ phase: PIXIE_PHASE.RETURN, at: clock(), status });
        return { status, domain: normalizedDomain, machineId, events, result };
      } catch (error) {
        events.push({ phase: PIXIE_PHASE.RETURN, at: clock(), status: 'UNKNOWN' });
        return { status: 'UNKNOWN', domain: normalizedDomain, machineId, events, failure: { class: FAILURE_CLASS.INTERNAL_ERROR, code: error.code || 'PIXIE_MACHINE_ERROR', message: error.message } };
      }
    },
  });
}
