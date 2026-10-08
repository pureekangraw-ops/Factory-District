import { assertExecutionTransition, assertReturnTransition } from './machine-state.mjs';
import { assertDurableStore } from './durable-store.mjs';

const copy = (value) => value == null ? value : structuredClone(value);
const runKey = (runId) => `machine/runs/${runId}`;
const itemKey = (kind, id) => `machine/${kind}/${id}`;
const stream = (kind, runId) => `machine/${kind}/${runId}`;

export function createDurableMachinePersistence({ store, clock = () => new Date().toISOString() } = {}) {
  const durable = assertDurableStore(store);

  async function getRecord(key) {
    return durable.get(key);
  }

  async function loadRun(runId) {
    return (await getRecord(runKey(runId)))?.value || null;
  }

  async function saveRun(currentRecord, next) {
    await durable.put(runKey(next.runId), next, { expectedVersion: currentRecord?.version || 0 });
    return copy(next);
  }

  async function appendRunEvent(runId, event) {
    await durable.append(stream('events', runId), { ...copy(event), observedAt: event.observedAt || clock() });
  }

  async function createRun(run) {
    const key = runKey(run.runId);
    const current = await getRecord(key);
    if (current) {
      const existing = current.value;
      if (existing?.workId === run.workId && existing?.machineId === run.machineId) return copy(existing);
      throw new Error('RUN_ALREADY_EXISTS');
    }
    await durable.put(key, run, { expectedVersion: 0 });
    await appendRunEvent(run.runId, { kind: 'RUN_CREATED', toState: run.executionState, sequence: run.sequence });
    return copy(run);
  }

  async function transitionRun(input) {
    const record = await getRecord(runKey(input.runId));
    const current = record?.value;
    if (!current) throw new Error('RUN_NOT_FOUND');
    if (current.sequence !== input.expectedSequence) throw new Error('PERSISTENCE_CONFLICT');

    if (input.axis === 'execution') assertExecutionTransition(current.executionState, input.toState, input.patch || {});
    if (input.axis === 'return') assertReturnTransition(current.returnState, input.toState);

    const next = {
      ...copy(current),
      ...copy(input.patch || {}),
      sequence: current.sequence + 1,
      updatedAt: input.at || clock(),
    };
    if (input.axis === 'execution') next.executionState = input.toState;
    if (input.axis === 'return') next.returnState = input.toState;

    await saveRun(record, next);
    await appendRunEvent(input.runId, {
      kind: 'RUN_TRANSITION',
      eventId: input.eventId || null,
      actorRef: input.actorRef || null,
      axis: input.axis,
      toState: input.toState,
      sequence: next.sequence,
      observedAt: input.at || clock(),
    });
    return copy(next);
  }

  async function startAttempt(input) {
    const record = await getRecord(runKey(input.runId));
    const current = record?.value;
    if (!current) throw new Error('RUN_NOT_FOUND');
    if (current.sequence !== input.expectedSequence) throw new Error('PERSISTENCE_CONFLICT');
    assertExecutionTransition(current.executionState, 'EXECUTING');

    await durable.put(itemKey('attempts', input.attempt.attemptId), input.attempt, { expectedVersion: 0 });
    await durable.append(stream('attempts', input.runId), input.attempt);

    const next = {
      ...copy(current),
      executionState: 'EXECUTING',
      checkpointId: input.checkpointId,
      attemptId: input.attempt.attemptId,
      sequence: current.sequence + 1,
      updatedAt: input.at || clock(),
    };
    await saveRun(record, next);
    await appendRunEvent(input.runId, {
      kind: 'ATTEMPT_STARTED',
      eventId: input.eventId || null,
      actorRef: input.actorRef || null,
      attemptId: input.attempt.attemptId,
      toState: 'EXECUTING',
      sequence: next.sequence,
      observedAt: input.at || clock(),
    });
    return copy(next);
  }

  async function appendHeartbeat(value) {
    await durable.put(itemKey('heartbeats', value.heartbeatId), value, { expectedVersion: 0 });
    await durable.append(stream('heartbeats', value.runId), value);
    return copy(value);
  }

  async function recordFailure(value) {
    await durable.put(itemKey('failures', value.failureId), value, { expectedVersion: 0 });
    await durable.append(stream('failures', value.runId), value);
    return copy(value);
  }

  async function recordCancellation(value) {
    const key = itemKey('cancellations', value.cancellationId);
    const current = await getRecord(key);
    const next = { ...(current?.value || {}), ...copy(value) };
    await durable.put(key, next, { expectedVersion: current?.version || 0 });
    await durable.append(stream('cancellations', value.runId), next);
    return copy(next);
  }

  async function appendEvidence(value) {
    await durable.put(itemKey('evidence', value.evidenceId), value, { expectedVersion: 0 });
    await durable.append(stream('evidence', value.runId), value);
    return copy(value);
  }

  async function recordVerification(value) {
    await durable.put(itemKey('verifications', value.verificationId), value, { expectedVersion: 0 });
    await durable.append(stream('verifications', value.runId), value);
    return copy(value);
  }

  async function recordReturn(value) {
    const record = await getRecord(runKey(value.runId));
    const current = record?.value;
    if (!current) throw new Error('RUN_NOT_FOUND');
    if (current.sequence !== value.expectedSequence) throw new Error('PERSISTENCE_CONFLICT');
    assertReturnTransition(current.returnState, value.state);

    await durable.put(itemKey('returns', value.returnId), value, { expectedVersion: 0 });
    const next = {
      ...copy(current),
      returnState: value.state,
      returnRef: value.returnId,
      sequence: current.sequence + 1,
      updatedAt: value.returnedAt || clock(),
    };
    await saveRun(record, next);
    await appendRunEvent(value.runId, {
      kind: 'RUN_RETURNED',
      returnId: value.returnId,
      toState: value.state,
      sequence: next.sequence,
      observedAt: value.returnedAt || clock(),
    });
    return { returnRecord: copy(value), run: copy(next) };
  }

  async function listValues(kind, runId) {
    return (await durable.list(stream(kind, runId))).map((entry) => copy(entry.value));
  }

  return Object.freeze({
    createRun,
    loadRun,
    transitionRun,
    startAttempt,
    appendHeartbeat,
    recordFailure,
    recordCancellation,
    appendEvidence,
    recordVerification,
    recordReturn,
    listAttempts: (runId) => listValues('attempts', runId),
    listEvents: (runId) => listValues('events', runId),
    listEvidence: (runId) => listValues('evidence', runId),
  });
}
