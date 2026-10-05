import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

test('Worker exposes health, receive and readback with durable adapter', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' }, { recordStore });
  const health = await worker.fetch(new Request('https://factory.example/health'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).storage.status, 'READY');

  const receive = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workId: 'WORK-WORKER', checkpointId: 'CP-1', source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' }, target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' }, ownerDomain: 'CODE', intent: 'LIVE_E2E_BOUNDARY_HANDOFF', scope: ['EXECUTE:CODE'], expectedSourceSha: 'worker-sha-1' }) }));
  assert.equal(receive.status, 202);
  const body = await receive.json();
  assert.equal(body.receipt.status, 'HANDOFF_VERIFIED');
  assert.equal(body.receipt.verificationScope, 'BOUNDARY_HANDOFF');

  const readback = await worker.fetch(new Request(`https://factory.example/station/readback/${body.receipt.receiptId}`));
  assert.equal(readback.status, 200);
  assert.equal((await readback.json()).boundaryVerified, true);
});

test('Worker refuses command execution when durable storage is not configured', async () => {
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' });
  const response = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
});
