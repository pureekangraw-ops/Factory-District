import test from 'node:test';
import assert from 'node:assert/strict';
import { createDwarfLogicTraineeRunner } from '../src/dwarf-logic-trainee.mjs';

function untouchedStore() {
  return {
    capabilities: { durable: true, atomicCompareAndSet: true, appendOnlyEvents: true, readAfterWrite: true },
    async get() { throw new Error('UNWIRED_LOGIC_MUST_NOT_READ_TRAINING_STATE'); },
    async put() { throw new Error('UNWIRED_LOGIC_MUST_NOT_WRITE_TRAINING_STATE'); },
    async append() { throw new Error('UNWIRED_LOGIC_MUST_NOT_APPEND_TRAINING_STATE'); },
    async list() { return []; },
  };
}

function work(intent = 'DWARF_LOGIC_WORKBENCH_TRAINING') {
  return {
    workId: 'WORK-DWARF-LOGIC',
    checkpointId: 'WORK-DWARF-LOGIC:CP-01',
    ownerDomain: 'LOGIC',
    intent,
    inputRefs: ['chat://dwarf-logic-training'],
  };
}

test('DWARF training placement does not claim Logic Workbench completion', async () => {
  const runner = createDwarfLogicTraineeRunner({ store: untouchedStore() });
  const result = await runner({ work: work(), actorRef: 'PIXIE' });

  assert.equal(result.run.executionState, 'UNKNOWN');
  assert.equal(result.run.returnState, 'PENDING');
  assert.equal(result.run.workId, 'WORK-DWARF-LOGIC');
  assert.equal(result.run.checkpointId, 'WORK-DWARF-LOGIC:CP-01');
  assert.equal(result.run.verificationRef, null);
  assert.deepEqual(result.run.evidenceRefs, []);
  assert.equal(result.failure.code, 'LOGIC_WORKBENCH_RUNNER_NOT_WIRED');
});

test('generic Logic work stays unknown without creating a trainee placement', async () => {
  const runner = createDwarfLogicTraineeRunner({ store: untouchedStore() });
  const result = await runner({ work: work('logic_create') });

  assert.equal(result.run.executionState, 'UNKNOWN');
  assert.equal(result.run.returnState, 'PENDING');
  assert.equal(result.run.workId, 'WORK-DWARF-LOGIC');
  assert.equal(result.run.checkpointId, 'WORK-DWARF-LOGIC:CP-01');
  assert.deepEqual(result.run.evidenceRefs, []);
  assert.equal(result.failure.code, 'LOGIC_WORKBENCH_RUNNER_NOT_WIRED');
});

test('DWARF trainee runner fails closed outside LOGIC', async () => {
  const runner = createDwarfLogicTraineeRunner({ store: untouchedStore() });
  const result = await runner({ work: { ...work(), ownerDomain: 'CODE' } });

  assert.equal(result.authorityBoundary, true);
  assert.equal(result.run.executionState, 'BLOCKED');
  assert.equal(result.failure.code, 'DWARF_LOGIC_DOMAIN_ONLY');
});
