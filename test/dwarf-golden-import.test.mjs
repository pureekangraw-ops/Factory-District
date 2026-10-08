import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { createDwarfLogicTraineeRunner } from '../src/dwarf-logic-trainee.mjs';

test('DWARF imports recovered Golden Cases through LOGIC without authority transfer', async () => {
  const store = createDurableStore({ driver: createInMemoryDurableDriver() });
  const runner = createDwarfLogicTraineeRunner({ store, clock: () => '2026-10-08T00:00:00.000Z' });
  const result = await runner({
    work: {
      workId: 'WORK-GOLDEN-IMPORT',
      checkpointId: 'WORK-GOLDEN-IMPORT:CP-01',
      ownerDomain: 'LOGIC',
      intent: 'IMPORT_GOLDEN_CASES',
    },
    actorRef: 'PIXIE',
  });
  assert.equal(result.run.executionState, 'COMPLETE');
  assert.equal(result.run.returnState, 'RETURNED');
  assert.equal(result.migration.count, 8);
  assert.equal(result.migration.imported.length, 8);
  assert.equal(result.migration.currentQualification, 'REQUALIFICATION_REQUIRED');
  assert.equal(result.migration.executableAsCurrent, false);
  assert.equal(result.authority.authorityTransferred, false);
  assert.ok(result.run.evidenceRefs[0].includes('logic/golden-cases/catalog/legacy-ergasterion-2026-10-08'));
});
