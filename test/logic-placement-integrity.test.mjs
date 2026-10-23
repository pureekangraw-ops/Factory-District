import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryRuntime } from '../src/factory-runtime.mjs';
import { createDwarfLogicTraineeRunner } from '../src/dwarf-logic-trainee.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

// All records in this suite are synthetic, local-only fixtures. The R2-shaped
// evidence URI is the existing contract, not proof of a production R2 write.
function work() {
  const workId = 'LOCAL-PLACEMENT-INTEGRITY', checkpointId = 'CP-05';
  return {
    workId, checkpointId, ownerDomain: 'LOGIC', intent: 'PLACE_DWARF_LOGIC_TRAINEE',
    inputRefs: ['fixture://local-input'], scope: ['EXECUTE:LOGIC'],
    source: { stationId: 'CITY', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'factory-district', component: 'FACTORY_HALL' },
    workPassRef: 'work-pass://local-integrity',
    workPass: { kind: 'WORK_PASS', version: 'WORK_PASS_V1', status: 'ACTIVE',
      passId: 'local-integrity', workId, checkpointId, actor: 'GO',
      permissions: { actions: ['handoff'], handoff: [{ stationId: 'FACTORY_STATION' }] } },
  };
}
const placementKey = `logic/trainees/DWARF-01/${work().workId}/${work().checkpointId}`;
const mutations = [
  ['wrong schema', r => { r.value.schema = 'OTHER_V1'; }],
  ['wrong status', r => { r.value.status = 'REJECTED'; }],
  ['wrong actor', r => { r.value.actorRef = 'OTHER'; }],
  ['wrong dwarf', r => { r.value.dwarfId = 'OTHER'; }],
  ['wrong work', r => { r.value.workId = 'OTHER'; }],
  ['wrong checkpoint', r => { r.value.checkpointId = 'OTHER'; }],
  ['wrong domain', r => { r.value.placement.domain = 'CODE'; }],
  ['wrong bench', r => { r.value.placement.bench = 'PRODUCTION'; }],
  ['wrong mode', r => { r.value.placement.mode = 'PRODUCTION'; }],
  ['production authority', r => { r.value.placement.productionAuthority = true; }],
  ['wrong qualification', r => { r.value.qualificationStatus = 'QUALIFIED'; }],
  ['different input evidence', r => { r.value.inputRefs = ['fixture://different-input']; }],
  ['missing input evidence', r => { delete r.value.inputRefs; }],
  ['missing authority', r => { delete r.value.authority; }],
  ...['changeWork', 'merge', 'deploy', 'acceptCurrent', 'authorityTransferred'].flatMap(flag => [
    [`${flag} authority`, r => { r.value.authority[flag] = true; }],
    [`missing ${flag} authority`, r => { delete r.value.authority[flag]; }],
  ]),
  ['wrong record key', r => { r.key = 'logic/trainees/OTHER'; }],
  ...[0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(version => [
    `invalid record version ${JSON.stringify(version)}`, r => { r.version = version; },
  ]),
];

async function fixture() {
  const driver = createInMemoryDurableDriver();
  let corrupt = null, failReceipt = true, executions = 0;
  const store = createDurableStore({ driver: {
    ...driver,
    async get(key) {
      const record = await driver.get(key);
      if (key === placementKey && record && corrupt) corrupt(record);
      return record;
    },
    async put(key, value, options) {
      if (key.startsWith('factory/receipt/') && failReceipt) {
        failReceipt = false;
        throw new Error('LOCAL_SIMULATED_RECEIPT_LOSS');
      }
      return driver.put(key, value, options);
    },
  } });
  const runner = createDwarfLogicTraineeRunner({ store });
  const runtime = createFactoryRuntime({ sourceSha: 'LOCAL-SYNTHETIC-SOURCE', recordStore: store,
    domainHandlers: { LOGIC: async ({ handoff }) => {
      executions++;
      const result = await runner({ work: handoff });
      return { status: 'RETURNED', completed: true, machineResult: result };
    } },
  });
  await assert.rejects(runtime.receive(work()), /LOCAL_SIMULATED_RECEIPT_LOSS/);
  assert.equal(executions, 1);
  return { runner, runtime, driver, corrupt: value => { corrupt = value; }, get executions() { return executions; } };
}

for (const [name, mutate] of mutations) {
  test(`persisted placement rejects ${name} in both execution and recovery`, async t => {
    const f = await fixture();
    f.corrupt(mutate);
    const before = await f.driver.get(placementKey);
    await t.test('execution', async () => {
      const result = await f.runner({ work: work() });
      assert.equal(result.run.executionState, 'UNKNOWN', 'execution must not bless corrupt persisted evidence');
      assert.equal(result.run.returnState, 'UNKNOWN');
      assert.equal(result.failure.code, 'DWARF_LOGIC_PLACEMENT_READBACK_UNVERIFIED');
      assert.equal(result.retryable, false);
      assert.equal(result.run.verificationRef, null);
      assert.equal(result.run.returnRef, null);
      assert.deepEqual(result.run.evidenceRefs, []);
    });
    await t.test('recovery', async () => {
      const recovery = await f.runtime.reconcile(work());
      assert.equal(recovery.status, 'UNKNOWN', 'recovery must use the same proof rules');
      assert.equal(recovery.reason, 'DURABLE_LOGIC_EFFECT_UNVERIFIED');
      assert.equal(recovery.recovered, false);
      assert.equal((await f.runtime.readback(recovery.receiptId)).domainVerified, false);
      assert.equal(await f.driver.get(`factory/receipt/${recovery.receiptId}`), null);
      assert.deepEqual(await f.driver.get(placementKey), before, 'never overwrite questionable proof');
      assert.equal(f.executions, 1, 'recovery must not replay a machine');
    });
  });
}

test('canonical V1 placement remains executable and recoverable without new receipt fields', async () => {
  const f = await fixture();
  const placed = await f.runner({ work: work() });
  assert.equal(placed.run.executionState, 'COMPLETE');
  assert.equal(placed.storageVersion, 1);
  assert.equal(Object.hasOwn(placed.trainee, 'sourceReceipt'), false);
  const recovered = await f.runtime.reconcile(work());
  assert.equal(recovered.status, 'RECOVERED');
  assert.equal(recovered.readback.domainVerified, true);
  assert.equal(recovered.readback.workId, work().workId);
  assert.equal(recovered.readback.checkpointId, work().checkpointId);
  assert.deepEqual(recovered.readback.result.evidenceRefs, placed.run.evidenceRefs);
  assert.equal(f.executions, 1);
});

test('runner still supports an explicit execution actor with exact persisted actor correlation', async () => {
  const store = createDurableStore({ driver: createInMemoryDurableDriver() });
  const runner = createDwarfLogicTraineeRunner({ store });
  const first = await runner({ work: work(), actorRef: 'LOCAL-CUSTOM-OPERATOR' });
  const same = await runner({ work: work(), actorRef: 'LOCAL-CUSTOM-OPERATOR' });
  assert.equal(first.run.executionState, 'COMPLETE');
  assert.equal(same.run.executionState, 'COMPLETE');
  assert.equal(same.storageVersion, 1);
  assert.equal((await runner({ work: work(), actorRef: 'PIXIE' })).run.executionState, 'UNKNOWN');
});

for (const [name, overrides, reason] of [
  ['missing execution scope', { scope: ['READ:LOGIC'] }, 'SCOPE_NOT_GRANTED'],
  ['source mismatch', { expectedSourceSha: 'DIFFERENT-LOCAL-SOURCE' }, 'SHA_MISMATCH'],
]) {
  test(`recovery cannot promote a denied intake with ${name}`, async () => {
    const driver = createInMemoryDurableDriver();
    let failReceipt = true, executions = 0;
    const store = createDurableStore({ driver: { ...driver, async put(key, value, options) {
      if (key.startsWith('factory/receipt/') && failReceipt) {
        failReceipt = false;
        throw new Error('LOCAL_SIMULATED_RECEIPT_LOSS');
      }
      return driver.put(key, value, options);
    } } });
    // An older canonical record alone must not override this intake's gates.
    await createDwarfLogicTraineeRunner({ store })({ work: work() });
    const runtime = createFactoryRuntime({ sourceSha: 'LOCAL-SYNTHETIC-SOURCE', recordStore: store,
      domainHandlers: { LOGIC: async () => { executions++; throw new Error('MUST_NOT_EXECUTE'); } },
    });
    const denied = { ...work(), ...overrides };
    await assert.rejects(runtime.receive(denied), /LOCAL_SIMULATED_RECEIPT_LOSS/);
    const recovered = await runtime.reconcile(denied);
    assert.equal(recovered.status, 'UNKNOWN');
    assert.equal(recovered.reason, reason);
    assert.equal(recovered.recovered, false);
    assert.equal((await runtime.readback(recovered.receiptId)).domainVerified, false);
    assert.equal(await driver.get(`factory/receipt/${recovered.receiptId}`), null);
    assert.equal(executions, 0);
  });
}
