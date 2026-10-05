import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineRun, createAttempt, EXECUTION_STATE, RETURN_STATE, SUBJECT_ASSESSMENT } from '../src/machine-contract.mjs';

test('MachineRun separates execution, return and subject assessment', () => {
  const run = createMachineRun({
    runId: 'RUN-1', workId: 'WORK-1', machineId: 'MACHINE-1', machineVersion: '0.1.0', domain: 'LOGIC',
    ingress: { systemId: 'METROPOLIS', surfaceType: 'STATION', surfaceId: 'METROPOLIS-STATION' },
    destination: { systemId: 'FACTORY', surfaceType: 'OWNER', surfaceId: 'LOGIC', ownerDomain: 'LOGIC' },
    transportRef: { kind: 'RAIL', linkId: 'LINK-A-B', trustBoundaryRef: 'TB-1' },
    requestedBy: { actorId: 'GO', authorityRef: 'AUTH-1', requestedAt: '2026-10-05T00:00:00Z' },
    subject: { subjectId: 'AGENT-1', subjectType: 'LOGIC_AGENT', ownerSystem: 'LOGIC', lifecycleAuthorityRef: 'LOGIC-OWNER' },
    inputRefs: ['input://1'], createdAt: '2026-10-05T00:00:00Z',
  });
  assert.equal(run.executionState, EXECUTION_STATE.RECEIVED);
  assert.equal(run.returnState, RETURN_STATE.PENDING);
  assert.equal(run.subjectAssessment.status, SUBJECT_ASSESSMENT.NOT_ASSESSED);
  assert.equal(run.transportRef.linkId, 'LINK-A-B');
});

test('Attempt requires a new lineage record for every retry', () => {
  const attempt = createAttempt({ attemptId: 'ATTEMPT-2', runId: 'RUN-1', parentAttemptId: 'ATTEMPT-1', ordinal: 2, reason: 'RETRY', executorRef: 'EXECUTOR-1', startedAt: 'now' });
  assert.equal(attempt.parentAttemptId, 'ATTEMPT-1');
  assert.equal(attempt.ordinal, 2);
});
