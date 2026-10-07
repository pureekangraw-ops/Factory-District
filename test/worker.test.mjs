import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { railRequest } from './support/rail-auth.mjs';

const RAIL_SECRET = 'test-rail-secret';

test('Worker exposes authenticated health, receive and readback with durable adapter', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET }, { recordStore });
  const health = await worker.fetch(new Request('https://factory.example/health'));
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.storage.status, 'READY');
  assert.equal(healthBody.transport.status, 'READY');
  assert.equal(healthBody.transport.protocol, 'METROPOLIS_FACTORY_STATION_V2');

  const payload = { workId: 'WORK-WORKER', checkpointId: 'CP-1', source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' }, target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' }, ownerDomain: 'CODE', intent: 'LIVE_E2E_BOUNDARY_HANDOFF', scope: ['EXECUTE:CODE'], expectedSourceSha: 'worker-sha-1' };
  const bodyText = JSON.stringify(payload);
  const receive = await worker.fetch(await railRequest('https://factory.example/station/receive', {
    method: 'POST',
    body: bodyText,
    secret: RAIL_SECRET,
    headers: { 'content-type': 'application/json' },
  }));
  assert.equal(receive.status, 202);
  const body = await receive.json();
  assert.equal(body.receipt.status, 'HANDOFF_VERIFIED');
  assert.equal(body.receipt.verificationScope, 'BOUNDARY_HANDOFF');

  const readback = await worker.fetch(await railRequest(`https://factory.example/station/readback/${body.receipt.receiptId}`, { secret: RAIL_SECRET }));
  assert.equal(readback.status, 200);
  assert.equal((await readback.json()).boundaryVerified, true);
});

test('Worker rejects unsigned rail traffic when transport is configured', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET }, { recordStore });
  const response = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, 'FACTORY_RAIL_PROTOCOL_INVALID');
});

test('Worker reports transport not configured when rail secret is absent', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' }, { recordStore });
  const response = await worker.fetch(new Request('https://factory.example/health'));
  const body = await response.json();
  assert.equal(body.transport.status, 'NOT_CONFIGURED');
});

test('Worker refuses command execution when durable storage is not configured', async () => {
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET });
  const response = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
});
