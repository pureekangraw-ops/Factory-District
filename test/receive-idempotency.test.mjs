import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryRuntime } from '../src/factory-runtime.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

function work(overrides = {}) {
  const pass = { kind: 'WORK_PASS', version: 'WORK_PASS_V1', status: 'ACTIVE',
    passId: 'one', workId: 'WORK-ONE', checkpointId: 'CP-ONE', actor: 'GO',
    permissions: { actions: ['handoff'], handoff: [{ stationId: 'FACTORY_STATION' }] } };
  return {
    workId: 'WORK-ONE', checkpointId: 'CP-ONE', ownerDomain: 'LOGIC',
    intent: 'EXECUTE', scope: ['EXECUTE:LOGIC'], inputRefs: [],
    source: { stationId: 'CITY', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'factory-district', component: 'FACTORY_HALL' },
    workPassRef: 'work-pass://one', workPass: pass,
    ...overrides,
  };
}
function harness(handler, driver = createInMemoryDurableDriver()) {
  let n = 0;
  const factory = createFactoryRuntime({
    sourceSha: 'test-sha', recordStore: createDurableStore({ driver }),
    idFactory: () => String(++n),
    domainHandlers: { LOGIC: handler },
  });
  return factory;
}

test('a repeated signed handoff reads the original receipt without re-executing a machine', async () => {
  let calls = 0;
  const factory = harness(async () => { calls++; return { status: 'UNKNOWN', completed: false }; });
  const a = await factory.receive(work());
  const b = await factory.receive(work({ requestedAt: '2026-10-14T03:00:00Z' }));
  assert.equal(calls, 1);
  assert.equal(b.receipt.receiptId, a.receipt.receiptId);
  assert.deepEqual(b.readback, await factory.readback(a.receipt.receiptId));
});

test('a changed command under the same Work/Checkpoint identity is rejected', async () => {
  let calls = 0;
  const factory = harness(async () => { calls++; return { status: 'UNKNOWN' }; });
  await factory.receive(work());
  await assert.rejects(factory.receive(work({ intent: 'DIFFERENT' })), /FACTORY_WORK_SCOPE_CONFLICT/);
  assert.equal(calls, 1);
});

test('a concurrent retry reports uncertainty until the first machine result is saved', async () => {
  let release;
  let signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const factory = harness(async () => {
    signalStarted();
    await new Promise(resolve => { release = resolve; });
    return { status: 'UNKNOWN' };
  });
  const firstPromise = factory.receive(work());
  await started;
  const retry = await factory.receive(work());
  assert.equal(retry.receipt.status, 'UNKNOWN');
  assert.equal(retry.readback.reason, 'FACTORY_EFFECT_UNRECONCILED');
  assert.equal((await factory.readback(retry.receipt.receiptId)).reason, 'RECEIPT_NOT_FOUND');
  release();
  const first = await firstPromise;
  assert.equal(first.receipt.receiptId, retry.receipt.receiptId);
  const after = await factory.receive(work());
  assert.equal(after.receipt.receiptId, first.receipt.receiptId);
});

test('a persistence failure does not trigger unsafe automatic re-execution', async () => {
  const base = createInMemoryDurableDriver();
  let machineCalls = 0;
  const faulty = {
    ...base,
    async put(key, value, options) {
      if (key.startsWith('factory/receipt/')) throw new Error('STORAGE_UNAVAILABLE');
      return base.put(key, value, options);
    },
  };
  const factory = harness(async () => { machineCalls++; return { status: 'UNKNOWN' }; }, faulty);
  await assert.rejects(factory.receive(work()), /STORAGE_UNAVAILABLE/);
  const retry = await factory.receive(work());
  assert.equal(retry.readback.reason, 'FACTORY_EFFECT_UNRECONCILED');
  assert.equal(machineCalls, 1);
});
