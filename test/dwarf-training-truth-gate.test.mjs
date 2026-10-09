import test from 'node:test';
import assert from 'node:assert/strict';
import { createDwarfLogicTraineeRunner } from '../src/dwarf-logic-trainee.mjs';

const store = {
  capabilities: { durable: true, atomicCompareAndSet: true, appendOnlyEvents: true, readAfterWrite: true },
  async get() { throw new Error('TRAINING_MUST_NOT_READ_PLACEMENT_AS_EXECUTION'); },
  async put() { throw new Error('TRAINING_MUST_NOT_WRITE_FAKE_EXECUTION'); },
  async append() { throw new Error('TRAINING_MUST_NOT_APPEND_FAKE_EXECUTION'); },
  async list() { return []; },
};

test('Dwarf Logic Workbench training cannot claim completion from placement only', async () => {
  const run = createDwarfLogicTraineeRunner({ store });
  const result = await run({
    work: {
      workId: 'WORK-TRAINING-1',
      checkpointId: 'WORK-TRAINING-1:CP-01',
      ownerDomain: 'LOGIC',
      intent: 'DWARF_LOGIC_WORKBENCH_TRAINING',
    },
  });
  assert.equal(result.failure.code, 'LOGIC_WORKBENCH_RUNNER_NOT_WIRED');
  assert.equal(result.run.executionState, 'BLOCKED');
  assert.equal(result.run.returnState, 'PENDING');
  assert.equal(result.run.verificationRef, null);
  assert.deepEqual(result.run.evidenceRefs, []);
});
