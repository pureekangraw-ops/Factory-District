import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryRuntime } from '../src/factory-runtime.mjs';
import { FACTORY_STATION_ID } from '../src/contract.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

const base = (ownerDomain, extra = {}) => ({ workId: `WORK-${ownerDomain}`, checkpointId: 'CP-1', source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' }, target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' }, ownerDomain, intent: 'EXECUTE', scope: [`EXECUTE:${ownerDomain}`], requestedAt: '2026-10-05T00:00:00Z', ...extra });

function runtime(overrides = {}) {
  let n = 0;
  return createFactoryRuntime({
    sourceSha: 'abc123', idFactory: () => `id-${++n}`, clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })(),
    domainHandlers: { CODE: async ({ handoff }) => ({ domain: 'CODE', workId: handoff.workId, completed: false }), VISUAL: async () => ({ domain: 'VISUAL', completed: false }), LOGIC: async () => ({ domain: 'LOGIC', completed: false }) },
    recordStore: createDurableStore({ driver: createInMemoryDurableDriver() }),
    ...overrides,
  });
}

test('health exposes exact source/runtime SHA and durable storage adapter', () => {
  const health = runtime().health();
  assert.equal(health.status, 'READY');
  assert.equal(health.sourceSha, 'abc123');
  assert.equal(health.runtimeSha, 'abc123');
  assert.deepEqual(health.storage, { status: 'READY', durability: 'ADAPTER' });
});

test('CODE, VISUAL and LOGIC use durable receipt/readback storage', async () => {
  const factory = runtime();
  for (const domain of ['CODE', 'VISUAL', 'LOGIC']) {
    const result = await factory.receive(base(domain));
    assert.equal(result.receipt.status, 'HANDOFF_VERIFIED');
    assert.equal(result.receipt.verificationScope, 'BOUNDARY_HANDOFF');
    assert.equal(result.readback.boundaryVerified, true);
    assert.equal((await factory.readback(result.receipt.receiptId)).boundaryVerified, true);
  }
});

test('missing durable store fails closed instead of creating runtime memory state', () => {
  assert.throws(() => createFactoryRuntime({ sourceSha: 'abc123', domainHandlers: {} }), /durableStore_REQUIRED/);
});
