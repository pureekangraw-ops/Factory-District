import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';

test('Worker exposes health, receive and readback with exact SHA', async () => {
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1' });
  const health = await worker.fetch(new Request('https://factory.example/health'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).runtimeSha, 'worker-sha-1');

  const receive = await worker.fetch(new Request('https://factory.example/station/receive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workId: 'WORK-WORKER', checkpointId: 'CP-1',
      source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
      target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' },
      ownerDomain: 'CODE', intent: 'EXECUTE', scope: ['EXECUTE:CODE'], expectedSourceSha: 'worker-sha-1',
    }),
  }));
  assert.equal(receive.status, 202);
  const body = await receive.json();
  assert.equal(body.receipt.status, 'HANDOFF_VERIFIED');
  assert.equal(body.receipt.verificationScope, 'BOUNDARY_HANDOFF');
  assert.equal(body.receipt.domainCompleted, false);

  const readback = await worker.fetch(new Request(`https://factory.example/station/readback/${body.receipt.receiptId}`));
  assert.equal(readback.status, 200);
  const readbackBody = await readback.json();
  assert.equal(readbackBody.boundaryVerified, true);
  assert.equal(readbackBody.verificationScope, 'BOUNDARY_HANDOFF');
  assert.equal(readbackBody.domainCompleted, false);
});
