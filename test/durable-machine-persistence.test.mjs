import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineKernel } from '../src/machine-kernel.mjs';
import { EXECUTION_STATE, RETURN_STATE, SUBJECT_ASSESSMENT } from '../src/machine-contract.mjs';
import { createDurableMachinePersistence } from '../src/durable-machine-persistence.mjs';
import { createR2RecordStore } from '../src/r2-record-store.mjs';
import { createLocalR2Bucket } from './support/local-r2-bucket.mjs';

function input(extra = {}) {
  return {
    runId: 'RUN-1', workId: 'WORK-1', machineId: 'MACHINE-1', machineVersion: '0.1.0', domain: 'CODE',
    ingress: { systemId: 'METROPOLIS', surfaceType: 'STATION', surfaceId: 'METROPOLIS-STATION' },
    destination: { systemId: 'FACTORY', surfaceType: 'OWNER', surfaceId: 'CODE', ownerDomain: 'CODE' },
    transportRef: { kind: 'RAIL', linkId: 'LINK-A-B', trustBoundaryRef: 'TB-1' },
    requestedBy: { actorId: 'GO', authorityRef: 'AUTH-1', requestedAt: '2026-10-05T00:00:00Z' },
    subject: { subjectId: 'CODE-1', subjectType: 'CODE_WORK', ownerSystem: 'GITHUB', lifecycleAuthorityRef: 'GITHUB-OWNER' },
    createdAt: '2026-10-05T00:00:00Z',
    ...extra,
  };
}

function makeKernel(options = {}) {
  let n = 0;
  return createMachineKernel({
    persistence: createDurableMachinePersistence({ store: createR2RecordStore(createLocalR2Bucket()) }),
    idFactory: () => `ID-${++n}`,
    clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })(),
  });
}

async function activeRun(kernel) {
  await kernel.receive(input());
  await kernel.interpret('RUN-1', { planRef: 'plan://1' });
  await kernel.startAttempt('RUN-1', { executorRef: 'executor://1' });
  return kernel.load('RUN-1');
}

test('durable adapter: kernel runs through verification to COMPLETE without claiming subject maturity', async () => {
  const kernel = makeKernel();
  await activeRun(kernel);
  await kernel.heartbeat('RUN-1', { sequence: 1, progress: 0.5, phase: 'EXECUTING' });
  await kernel.beginVerification('RUN-1');
  const complete = await kernel.verify('RUN-1', {
    evidence: [{ kind: 'TEST', verificationScope: 'EXECUTION', source: { systemId: 'GITHUB' }, contentRef: 'evidence://test-1' }],
    verification: { status: 'PASS', observed: { sourceSha: 'sha-1' } },
  });
  assert.equal(complete.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(complete.returnState, RETURN_STATE.PENDING);
  assert.equal(complete.subjectAssessment.status, SUBJECT_ASSESSMENT.NOT_ASSESSED);
});

test('durable adapter: return failure does not undo execution completion and can be retried', async () => {
  const kernel = makeKernel();
  await activeRun(kernel);
  await kernel.beginVerification('RUN-1');
  await kernel.verify('RUN-1', { evidence: [{ kind: 'RUNTIME', verificationScope: 'RUNTIME', source: { systemId: 'OWNER' }, contentRef: 'evidence://runtime-1' }], verification: { status: 'PASS' } });
  const failed = await kernel.failReturn('RUN-1', { reason: 'RAIL_UNAVAILABLE' });
  assert.equal(failed.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(failed.returnState, RETURN_STATE.FAILED);
  const pending = await kernel.retryReturn('RUN-1');
  assert.equal(pending.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(pending.returnState, RETURN_STATE.PENDING);
});

test('durable adapter: cancel is verified before CANCELLED; missing stop evidence becomes UNKNOWN', async () => {
  const kernel = makeKernel();
  await activeRun(kernel);
  await kernel.requestCancel('RUN-1', { requestedBy: 'BIG', authorityRef: 'AUTH-CANCEL', reason: 'STOP_WORK' });
  assert.equal((await kernel.load('RUN-1')).executionState, EXECUTION_STATE.CANCELLING);
  const unknown = await kernel.confirmCancellation('RUN-1');
  assert.equal(unknown.executionState, EXECUTION_STATE.UNKNOWN);

  const second = makeKernel();
  await second.receive(input({ runId: 'RUN-2', workId: 'WORK-2' }));
  await second.interpret('RUN-2');
  await second.startAttempt('RUN-2', { executorRef: 'executor://1' });
  await second.requestCancel('RUN-2', { requestedBy: 'BIG', authorityRef: 'AUTH-CANCEL', reason: 'STOP_WORK' });
  const cancelled = await second.confirmCancellation('RUN-2', { stopEvidence: [{ kind: 'STOP', verificationScope: 'EXECUTION', source: { systemId: 'MACHINE' }, contentRef: 'evidence://stopped' }] });
  assert.equal(cancelled.executionState, EXECUTION_STATE.CANCELLED);
});

test('durable adapter: invalid transition is rejected', async () => {
  const kernel = makeKernel();
  await kernel.receive(input());
  await assert.rejects(() => kernel.beginVerification('RUN-1'), /VERIFY_REQUIRES_EXECUTING/);
});

test('durable adapter: verification without evidence cannot complete', async () => {
  const kernel = makeKernel();
  await activeRun(kernel);
  await kernel.beginVerification('RUN-1');
  const unknown = await kernel.verify('RUN-1', { evidence: [], verification: { status: 'PASS' } });
  assert.equal(unknown.executionState, EXECUTION_STATE.UNKNOWN);
});

test('durable adapter: subject qualification requires an owner decision and is separate from run completion', async () => {
  const kernel = makeKernel();
  await activeRun(kernel);
  await kernel.beginVerification('RUN-1');
  await kernel.verify('RUN-1', { evidence: [{ kind: 'E', verificationScope: 'EXECUTION', source: { systemId: 'LOGIC' }, contentRef: 'evidence://e' }], verification: { status: 'PASS' } });
  await assert.rejects(() => kernel.assessSubject('RUN-1', { status: SUBJECT_ASSESSMENT.QUALIFIED }), /OWNER_DECISION_REQUIRED/);
  const assessed = await kernel.assessSubject('RUN-1', { status: SUBJECT_ASSESSMENT.QUALIFIED, ownerDecisionRef: 'decision://owner', evidenceRefs: ['evidence://qual'] });
  assert.equal(assessed.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(assessed.subjectAssessment.status, SUBJECT_ASSESSMENT.QUALIFIED);
});

test('durable adapter: restarted instance reads the same persisted run and rejects a competing transition',async()=>{
  const store=createR2RecordStore(createLocalR2Bucket());
  const first=createDurableMachinePersistence({store}),second=createDurableMachinePersistence({store});
  const kernel=createMachineKernel({persistence:first});
  await kernel.receive(input({checkpointId:'WORK:EXTERNAL'}));
  assert.equal((await second.loadRun('RUN-1')).workCheckpointId,'WORK:EXTERNAL');
  const results=await Promise.allSettled([first,second].map(p=>p.transitionRun({runId:'RUN-1',expectedSequence:0,
    axis:'execution',toState:'INTERPRETED',patch:{checkpointId:'CP-02'},eventId:crypto.randomUUID(),actorRef:'LOCAL',at:'local'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await second.loadRun('RUN-1')).sequence,1);
  assert.equal((await second.listEvents('RUN-1')).length,2);
});
