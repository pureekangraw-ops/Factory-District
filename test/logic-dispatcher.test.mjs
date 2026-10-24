import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogicDispatcher } from '../src/logic-dispatcher.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

function fixture() {
  const store = createDurableStore({ driver: createInMemoryDurableDriver() });
  const work = { workId: 'LOCAL-LOGIC', checkpointId: 'LOCAL-LOGIC:CP-01',
    ownerDomain: 'LOGIC', intent: 'PLACE_DWARF_LOGIC_TRAINEE', inputRefs: [] };
  const key = `logic/trainees/DWARF-01/${work.workId}/${work.checkpointId}`;
  return { store, work, key };
}

test('explicit DWARF placement keeps durable identity, idempotency and false authority flags', async () => {
  const { store, work, key } = fixture();
  let calls = 0;
  const route = createLogicDispatcher({ store, runner: async () => { calls++; } });
  const first = await route({ work });
  const repeat = await route({ work });
  assert.equal(first.run.executionState, 'COMPLETE');
  assert.equal(repeat.storageVersion, 1);
  assert.equal(repeat.run.returnRef, first.run.returnRef);
  assert.equal((await store.get(key)).value.status, 'PLACED_FOR_TRAINING');
  assert.equal(first.trainee.placement.productionAuthority, false);
  assert.ok(Object.values(first.trainee.authority).every(value => value === false));
  assert.equal(calls, 0);
});

test('generic LOGIC delegates the exact work to its runner without placing DWARF', async () => {
  const { store, work, key } = fixture();
  const input = { work: { ...work, intent: 'EXECUTE_LOGIC' }, actorRef: 'PIXIE', attempt: 1 };
  const output = { marker: 'separate-runner-result' };
  let seen;
  const route = createLogicDispatcher({ store, runner: async value => { seen = value; return output; } });
  assert.equal(await route(input), output);
  assert.equal(seen, input);
  assert.equal(await store.get(key), null);
});

test('unconfigured generic LOGIC stays UNKNOWN with no placement or verification claim', async () => {
  const { store, work, key } = fixture();
  const result = await createLogicDispatcher({ store })({ work: { ...work, intent: 'EXECUTE_LOGIC' } });
  assert.equal(result.failure.code, 'LOGIC_RUNNER_NOT_CONFIGURED');
  assert.equal(result.run.executionState, 'UNKNOWN');
  assert.equal(result.run.workId, work.workId);
  assert.equal(result.run.checkpointId, work.checkpointId);
  assert.equal(result.run.verificationRef, null);
  assert.deepEqual(result.run.evidenceRefs, []);
  assert.equal(await store.get(key), null);
});

test('wrong domain cannot call either LOGIC runner or DWARF', async () => {
  const { store, work, key } = fixture();
  let calls = 0;
  const route = createLogicDispatcher({ store, runner: async () => { calls++; } });
  const result = await route({ work: { ...work, ownerDomain: 'CODE' } });
  assert.equal(result.failure.code, 'LOGIC_DOMAIN_ONLY');
  assert.equal(calls, 0);
  assert.equal(await store.get(key), null);
});

test('legacy golden-case import remains available without becoming generic execution', async () => {
  const { store, work, key } = fixture();
  let calls = 0;
  const route = createLogicDispatcher({ store, runner: async () => { calls++; } });
  const result = await route({ work: { ...work, intent: 'import_golden_cases' } });
  assert.equal(result.run.executionState, 'COMPLETE');
  assert.ok(result.migration);
  assert.equal(await store.get(key), null);
  assert.equal(calls, 0);
});

test('runner exceptions do not trigger a DWARF fallback', async () => {
  const { store, work, key } = fixture();
  const route = createLogicDispatcher({ store, runner: async () => { throw new Error('LOCAL_FAILURE'); } });
  await assert.rejects(route({ work: { ...work, intent: 'EXECUTE_LOGIC' } }), /LOCAL_FAILURE/);
  assert.equal(await store.get(key), null);
});
