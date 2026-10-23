import { assertDurableStore } from './durable-store.mjs';
import { assertExecutionTransition, assertReturnTransition } from './machine-state.mjs';

const copy = value => structuredClone(value);
const keyFor = runId => `machine/runs/${encodeURIComponent(runId)}`;
const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name}_REQUIRED`);
  return value;
};

// One CAS-protected aggregate per run keeps transitions and their audit records
// atomic. Failure never retries a machine effect or substitutes an in-memory run.
export function createDurableMachinePersistence({ store } = {}) {
  const durable = assertDurableStore(store);
  async function load(runId) {
    required(runId, 'runId');
    const record = await durable.get(keyFor(runId));
    if (!record) return null;
    if (record.value?.kind !== 'MACHINE_STATE_V1' || record.value.run?.runId !== runId)
      throw new Error('MACHINE_STATE_UNVERIFIED');
    return record;
  }
  async function mutate(runId, expectedSequence, update) {
    const record = await load(runId);
    if (!record) throw new Error('RUN_NOT_FOUND');
    const state = copy(record.value);
    if (expectedSequence != null && state.run.sequence !== expectedSequence)
      throw new Error('PERSISTENCE_CONFLICT');
    const result = update(state);
    await durable.put(keyFor(runId), state, { expectedVersion: record.version });
    return copy(result);
  }
  function transition(state, input, patch, axis, toState) {
    if (axis === 'execution') assertExecutionTransition(state.run.executionState, toState, patch);
    else assertReturnTransition(state.run.returnState, toState);
    const next = { ...state.run, ...patch, sequence: state.run.sequence + 1, updatedAt: input.at };
    if (axis === 'execution') next.executionState = toState;
    else next.returnState = toState;
    // Correlation and owner identity cannot be modified by a phase transition.
    for (const field of ['runId','workId','workCheckpointId','domain','machineId'])
      if (next[field] !== state.run[field]) throw new Error('MACHINE_IDENTITY_IMMUTABLE');
    state.run = next;
    state.events.push({ eventId: input.eventId, actorRef: input.actorRef, at: input.at,
      axis, toState, sequence: next.sequence });
    return next;
  }
  async function append(input, collection, idField) {
    return mutate(input.runId, null, state => {
      const id = required(input[idField], idField);
      if (state[collection].some(item => item[idField] === id)) throw new Error('PERSISTENCE_CONFLICT');
      if (input.attemptId && !state.attempts.some(item => item.attemptId === input.attemptId))
        throw new Error('ATTEMPT_NOT_FOUND');
      state[collection].push(copy(input));
      return input;
    });
  }
  return Object.freeze({
    async createRun(run) {
      const state = { kind: 'MACHINE_STATE_V1', run: copy(run), attempts: [], events: [],
        evidence: [], heartbeats: [], failures: [], cancellations: [], verifications: [], returns: [] };
      state.events.push({ eventId: `create-${run.runId}`, toState: run.executionState, sequence: run.sequence });
      await durable.put(keyFor(required(run.runId,'runId')),state,{ expectedVersion: 0 });
      return copy(run);
    },
    async loadRun(runId) { return copy((await load(runId))?.value.run || null); },
    async transitionRun(input) {
      return mutate(input.runId,input.expectedSequence,state => {
        if (!['execution','return'].includes(input.axis)) throw new Error('TRANSITION_AXIS_INVALID');
        if (input.toState === 'CANCELLED') {
          const refs = input.patch?.cancellationEvidenceRefs || [];
          if (refs.some(ref => !state.evidence.some(item => item.evidenceId === ref)))
            throw new Error('PERSISTENCE_STOP_EVIDENCE_REQUIRED');
        }
        return transition(state,input,input.patch || {},input.axis,input.toState);
      });
    },
    async startAttempt(input) {
      return mutate(input.runId,input.expectedSequence,state => {
        if (input.attempt.runId !== input.runId || state.attempts.some(a => a.attemptId === input.attempt.attemptId))
          throw new Error('PERSISTENCE_CONFLICT');
        state.attempts.push(copy(input.attempt));
        return transition(state,input,{ checkpointId: input.checkpointId, attemptId: input.attempt.attemptId },'execution','EXECUTING');
      });
    },
    appendHeartbeat: input => append(input,'heartbeats','heartbeatId'),
    recordFailure: input => append(input,'failures','failureId'),
    appendEvidence: input => append(input,'evidence','evidenceId'),
    recordVerification: input => append(input,'verifications','verificationId'),
    async recordCancellation(input) {
      return mutate(input.runId,null,state => {
        const id = required(input.cancellationId,'cancellationId');
        const index = state.cancellations.findIndex(c => c.cancellationId === id);
        const next = { ...(index < 0 ? {} : state.cancellations[index]), ...copy(input) };
        if (index < 0) state.cancellations.push(next); else state.cancellations[index] = next;
        return next;
      });
    },
    async recordReturn(input) {
      return mutate(input.runId,input.expectedSequence,state => {
        if (['RECEIVED','INTERPRETED','EXECUTING','VERIFYING','CANCELLING'].includes(state.run.executionState))
          throw new Error('RETURN_REQUIRES_SETTLED_EXECUTION');
        state.returns.push(copy(input));
        const run = transition(state,{ ...input, at: input.returnedAt, eventId: input.returnId },
          { returnRef: input.returnId, resultRefs: input.resultRefs || [] },'return',input.state);
        return { run, returnRecord: input };
      });
    },
    async listAttempts(runId) { return copy((await load(runId))?.value.attempts || []); },
    async listEvents(runId) { return copy((await load(runId))?.value.events || []); },
    async listEvidence(runId) { return copy((await load(runId))?.value.evidence || []); },
  });
}
