import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

function boundaryHandoff() {
  const pass = {
    kind: 'WORK_PASS',
    version: 'WORK_PASS_V1',
    passId: 'PASS:WORK-WORKER:CP-1',
    workId: 'WORK-WORKER',
    checkpointId: 'CP-1',
    actor: 'GO',
    status: 'ACTIVE',
    permissions: { actions: ['read', 'handoff', 'return'], handoff: [{ stationId: 'FACTORY_STATION' }] },
    authorityTransferred: false,
  };
  return {
    workId: 'WORK-WORKER',
    checkpointId: 'CP-1',
    workPassRef: `work-pass://${pass.passId}`,
    workPass: pass,
    source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain: 'CODE',
    intent: 'LIVE_E2E_BOUNDARY_HANDOFF',
    scope: ['EXECUTE:CODE'],
    expectedSourceSha: 'worker-sha-1',
  };
}

test('Worker exposes health, receive and readback with durable adapter', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' }, { recordStore });
  const health = await worker.fetch(new Request('https://factory.example/health'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).storage.status, 'READY');

  const input = boundaryHandoff();
  const receive = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }));
  assert.equal(receive.status, 202);
  const body = await receive.json();
  assert.equal(body.receipt.status, 'HANDOFF_VERIFIED');
  assert.equal(body.receipt.verificationScope, 'BOUNDARY_HANDOFF');
  assert.equal(body.receipt.workPassRef, input.workPassRef);

  const readback = await worker.fetch(new Request(`https://factory.example/station/readback/${body.receipt.receiptId}`));
  assert.equal(readback.status, 200);
  const readbackBody = await readback.json();
  assert.equal(readbackBody.boundaryVerified, true);
  assert.equal(readbackBody.workPassRef, input.workPassRef);
});

test('Worker rejects invalid Work Pass before creating a receipt', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' }, { recordStore });
  const input = boundaryHandoff();
  input.workPass.status = 'CANCELLED';
  const response = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', body: JSON.stringify(input) }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, 'FACTORY_WORK_PASS_INACTIVE');
  assert.equal((await recordStore.list('factory/receipt-events')).length, 0);
});

test('Worker refuses command execution when durable storage is not configured', async () => {
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' });
  const response = await worker.fetch(new Request('https://factory.example/station/receive', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 503);
});
