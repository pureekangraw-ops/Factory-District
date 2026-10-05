import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore, assertDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

test('durable store requires explicit durability and consistency capabilities', () => {
  assert.throws(() => assertDurableStore({}), /durableStore.get_REQUIRED/);
  assert.throws(() => assertDurableStore({ get() {}, put() {}, append() {}, list() {}, capabilities: {} }), /durableStore.durable_REQUIRED/);
  assert.doesNotThrow(() => assertDurableStore(createInMemoryDurableDriver()));
});

test('adapter preserves read-after-write and compare-and-set semantics', async () => {
  const store = createDurableStore({ driver: createInMemoryDurableDriver() });
  await store.put('run/RUN-1', { state: 'RECEIVED' }, { expectedVersion: 0 });
  assert.deepEqual((await store.get('run/RUN-1')).value, { state: 'RECEIVED' });
  await assert.rejects(() => store.put('run/RUN-1', { state: 'COMPLETE' }, { expectedVersion: 0 }), /DURABLE_CONFLICT/);
  await store.put('run/RUN-1', { state: 'INTERPRETED' }, { expectedVersion: 1 });
  const event = await store.append('run-events', { runId: 'RUN-1', state: 'INTERPRETED' });
  assert.equal(event.sequence, 1);
  assert.equal((await store.list('run-events')).length, 1);
});
