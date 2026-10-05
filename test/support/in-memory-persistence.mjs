import { assertExecutionTransition, assertReturnTransition } from '../../src/machine-state.mjs';

function copy(value) { return value == null ? value : structuredClone(value); }

export function createInMemoryPersistence({ failOn = null } = {}) {
  const runs = new Map();
  const attempts = new Map();
  const heartbeats = new Map();
  const failures = new Map();
  const cancellations = new Map();
  const evidence = new Map();
  const gates = new Map();
  const returns = new Map();
  const events = new Map();
  function maybeFail(method) { if (failOn === method) throw Object.assign(new Error(`${method}_FAILED`), { code: 'PERSISTENCE_ERROR' }); }
  function event(runId, value) { const list = events.get(runId) || []; list.push(copy(value)); events.set(runId, list); }
  function updateRun(input, updater) {
    maybeFail('transitionRun');
    const current = runs.get(input.runId);
    if (!current) throw new Error('RUN_NOT_FOUND');
    if (current.sequence !== input.expectedSequence) throw new Error('PERSISTENCE_CONFLICT');
    if (input.axis === 'execution') {
      assertExecutionTransition(current.executionState, input.toState, input.patch || {});
      if (input.toState === 'CANCELLED') {
        const refs = input.patch?.cancellationEvidenceRefs || [];
        if (refs.some((ref) => ![...evidence.values()].some((item) => item.evidenceId === ref && item.runId === input.runId))) {
          throw new Error('PERSISTENCE_STOP_EVIDENCE_REQUIRED');
        }
      }
    }
    const next = updater(copy(current));
    next.sequence = current.sequence + 1;
    next.updatedAt = input.at;
    runs.set(input.runId, copy(next));
    event(input.runId, { eventId: input.eventId, actorRef: input.actorRef, at: input.at, axis: input.axis, toState: input.toState, sequence: next.sequence });
    return copy(next);
  }
  return {
    async createRun(run) { maybeFail('createRun'); if (runs.has(run.runId)) throw new Error('RUN_ALREADY_EXISTS'); runs.set(run.runId, copy(run)); event(run.runId, { eventId: `create-${run.runId}`, toState: run.executionState, sequence: run.sequence }); return copy(run); },
    async loadRun(runId) { return copy(runs.get(runId) || null); },
    async transitionRun(input) {
      const current = runs.get(input.runId);
      if (input.axis === 'execution') assertExecutionTransition(current?.executionState, input.toState, input.patch || {});
      if (input.axis === 'return') assertReturnTransition(current?.returnState, input.toState);
      return updateRun(input, (next) => { if (input.axis === 'execution') next.executionState = input.toState; if (input.axis === 'return') next.returnState = input.toState; Object.assign(next, copy(input.patch || {})); return next; });
    },
    async startAttempt(input) { maybeFail('startAttempt'); const current = runs.get(input.runId); if (!current || current.sequence !== input.expectedSequence) throw new Error('PERSISTENCE_CONFLICT'); assertExecutionTransition(current.executionState, 'EXECUTING'); attempts.set(input.attempt.attemptId, copy(input.attempt)); return updateRun({ ...input, axis: 'execution', toState: 'EXECUTING' }, (next) => { next.executionState = 'EXECUTING'; next.checkpointId = input.checkpointId; next.attemptId = input.attempt.attemptId; return next; }); },
    async appendHeartbeat(value) { maybeFail('appendHeartbeat'); heartbeats.set(value.heartbeatId, copy(value)); return copy(value); },
    async recordFailure(value) { maybeFail('recordFailure'); failures.set(value.failureId, copy(value)); return copy(value); },
    async recordCancellation(value) { maybeFail('recordCancellation'); cancellations.set(value.cancellationId, { ...(cancellations.get(value.cancellationId) || {}), ...copy(value) }); return copy(cancellations.get(value.cancellationId)); },
    async appendEvidence(value) { maybeFail('appendEvidence'); evidence.set(value.evidenceId, copy(value)); return copy(value); },
    async recordVersionGate(value) { maybeFail('recordVersionGate'); gates.set(value.versionGateId, copy(value)); return copy(value); },
    async recordReturn(value) { maybeFail('recordReturn'); const current = runs.get(value.runId); if (!current || current.sequence !== value.expectedSequence) throw new Error('PERSISTENCE_CONFLICT'); assertReturnTransition(current.returnState, value.state); returns.set(value.returnId, copy(value)); const next = copy(current); next.returnState = value.state; next.returnRef = value.returnId; next.sequence += 1; next.updatedAt = value.returnedAt; runs.set(value.runId, next); event(value.runId, { eventId: value.returnId, axis: 'return', toState: value.state, sequence: next.sequence }); return { returnRecord: copy(value), run: copy(next) }; },
    async listAttempts(runId) { return [...attempts.values()].filter((item) => item.runId === runId).sort((a, b) => a.ordinal - b.ordinal).map(copy); },
    async listEvents(runId) { return copy(events.get(runId) || []); },
    async listEvidence(runId) { return [...evidence.values()].filter((item) => item.runId === runId).map(copy); },
  };
}
