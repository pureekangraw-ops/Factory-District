import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore } from '../src/durable-store.mjs';
import { createDwarfLogicTraineeRunner, DWARF_ID } from '../src/dwarf-logic-trainee.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

function store() {
  return createDurableStore({ driver: createInMemoryDurableDriver() });
}

function work() {
  return {
    workId: 'WORK-DWARF-LOGIC',
    checkpointId: 'WORK-DWARF-LOGIC:CP-01',
    ownerDomain: 'LOGIC',
    intent: 'EXECUTE',
    inputRefs: ['chat://dwarf-logic-training'],
  };
}

test('DWARF is placed at LOGIC DEVELOPMENT_BENCH without production authority', async () => {
  const durable = store();
  const runner = createDwarfLogicTraineeRunner({
    store: durable,
    clock: () => '2026-10-08T00:00:00.000Z',
  });
  const result = await runner({ work: work(), actorRef: 'PIXIE' });

  assert.equal(result.run.executionState, 'COMPLETE');
  assert.equal(result.run.returnState, 'RETURNED');
  assert.equal(result.run.workId, 'WORK-DWARF-LOGIC');
  assert.equal(result.trainee.dwarfId, DWARF_ID);
  assert.equal(result.trainee.placement.domain, 'LOGIC');
  assert.equal(result.trainee.placement.bench, 'DEVELOPMENT_BENCH');
  assert.equal(result.trainee.placement.mode, 'TRAINING');
  assert.equal(result.trainee.placement.productionAuthority, false);
  assert.equal(result.trainee.authority.merge, false);
  assert.equal(result.trainee.authority.deploy, false);
  assert.equal(result.trainee.authority.acceptCurrent, false);
  assert.equal(result.trainee.qualificationStatus, 'PENDING_OWNER');
  assert.ok(result.run.evidenceRefs[0].startsWith('r2://factory/records/logic/trainees/DWARF-01/'));
});

test('DWARF trainee placement is idempotent for the same Work checkpoint', async () => {
  const durable = store();
  const runner = createDwarfLogicTraineeRunner({ store: durable });
  const first = await runner({ work: work() });
  const second = await runner({ work: work() });

  assert.equal(second.storageVersion, first.storageVersion);
  assert.equal(second.run.evidenceRefs[0], first.run.evidenceRefs[0]);
});

test('DWARF trainee runner fails closed outside LOGIC', async () => {
  const runner = createDwarfLogicTraineeRunner({ store: store() });
  const result = await runner({ work: { ...work(), ownerDomain: 'CODE' } });

  assert.equal(result.authorityBoundary, true);
  assert.equal(result.run.executionState, 'BLOCKED');
  assert.equal(result.failure.code, 'DWARF_LOGIC_DOMAIN_ONLY');
});
