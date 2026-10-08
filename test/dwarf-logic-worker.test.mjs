import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { createDwarfLogicWorker, DWARF_LOGIC_EMPLOYMENT } from '../src/dwarf-logic-worker.mjs';

function store() {
  return createDurableStore({ driver: createInMemoryDurableDriver() });
}

function work() {
  return {
    workId: 'WORK-DWARF-ACTIVE',
    checkpointId: 'WORK-DWARF-ACTIVE:CP-01',
    ownerDomain: 'LOGIC',
    intent: 'EXECUTE',
    workPassRef: 'work-pass://DWARF-ACTIVE',
    workPass: { actor: 'GO' },
    requestedAt: '2026-10-08T01:50:00.000Z',
  };
}

test('DWARF is an active LOGIC worker and merge remains denied', () => {
  assert.equal(DWARF_LOGIC_EMPLOYMENT.status, 'ACTIVE');
  assert.equal(DWARF_LOGIC_EMPLOYMENT.executionAllowed, true);
  assert.equal(DWARF_LOGIC_EMPLOYMENT.testsAllowed, true);
  assert.equal(DWARF_LOGIC_EMPLOYMENT.mergeAllowed, false);
});

test('DWARF runs the complete LOGIC machine and learns all 8 legacy Golden Cases', async () => {
  let n = 0;
  let t = 0;
  const runner = createDwarfLogicWorker({
    store: store(),
    idFactory: () => `ID-${++n}`,
    clock: () => `2026-10-08T01:50:${String(t++).padStart(2, '0')}.000Z`,
  });
  const result = await runner({ work: work(), actorRef: 'PIXIE' });

  assert.equal(result.run.executionState, 'COMPLETE');
  assert.equal(result.run.returnState, 'RETURNED');
  assert.equal(result.worker.status, 'ACTIVE');
  assert.equal(result.authority.execute, true);
  assert.equal(result.authority.test, true);
  assert.equal(result.authority.merge, false);
  assert.equal(result.training.total, 8);
  assert.equal(result.training.learned, 8);
  assert.equal(result.training.legacyParityPass, 8);
  assert.equal(result.training.currentReplay.pass, 0);
  assert.equal(result.training.currentReplay.regression, 0);
  assert.equal(result.training.currentReplay.unknown, 8);
  assert.equal(result.training.currentReplay.qualification, 'REQUALIFICATION_REQUIRED');

  const steps = result.steps.map((item) => item.step);
  assert.deepEqual(steps, [
    'DESIGN_BENCH',
    'BUILD_BENCH',
    'DEVELOPMENT_BENCH',
    'SIMULATION',
    'GOLDEN_CASES',
    'EVALUATION',
    'QUALIFICATION',
    'VERSIONING',
  ]);
});

test('DWARF active worker is idempotent for the same completed Work checkpoint', async () => {
  const durable = store();
  const runner = createDwarfLogicWorker({ store: durable });
  const first = await runner({ work: work() });
  const second = await runner({ work: work() });
  assert.equal(first.run.executionState, 'COMPLETE');
  assert.equal(second.run.executionState, 'COMPLETE');
  assert.equal(second.idempotent, true);
  assert.equal(second.training.learned, 8);
});

test('DWARF active worker fails closed outside LOGIC', async () => {
  const runner = createDwarfLogicWorker({ store: store() });
  const result = await runner({ work: { ...work(), ownerDomain: 'CODE' } });
  assert.equal(result.authorityBoundary, true);
  assert.equal(result.run.executionState, 'BLOCKED');
  assert.equal(result.failure.code, 'DWARF_LOGIC_DOMAIN_ONLY');
});
