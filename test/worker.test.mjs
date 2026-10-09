import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { railRequest } from './support/rail-auth.mjs';

const RAIL_SECRET = 'test-rail-secret';

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

test('Worker exposes authenticated health, receive and readback with durable adapter', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET }, { recordStore });
  const health = await worker.fetch(new Request('https://factory.example/health'));
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.storage.status, 'READY');
  assert.equal(healthBody.transport.status, 'READY');
  assert.equal(healthBody.transport.protocol, 'METROPOLIS_FACTORY_STATION_V2');

  const payload = boundaryHandoff();
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
  assert.equal(body.receipt.workPassRef, payload.workPassRef);

  const readback = await worker.fetch(await railRequest(`https://factory.example/station/readback/${body.receipt.receiptId}`, { secret: RAIL_SECRET }));
  assert.equal(readback.status, 200);
  const readbackBody = await readback.json();
  assert.equal(readbackBody.boundaryVerified, true);
  assert.equal(readbackBody.workPassRef, payload.workPassRef);
});


test('signed city rail accepts delegated LIGHT and rejects missing/mismatched city grant', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({
    SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET,
  }, { recordStore });
  const payload = { ...boundaryHandoff(), actingActor: 'LIGHT', operation: 'FACTORY_HANDOFF' };
  const submit = async body => worker.fetch(await railRequest('https://factory.example/station/receive', {
    method: 'POST', body: JSON.stringify(body), secret: RAIL_SECRET,
    headers: { 'content-type': 'application/json' },
  }));

  let denied = await submit(payload);
  assert.equal(denied.status, 400);
  assert.equal((await denied.json()).reason, 'FACTORY_ACTOR_DELEGATION_REQUIRED');
  assert.equal((await recordStore.list('factory/receipt-events')).length, 0);

  payload.cityAuthorization = {
    kind: 'CITY_AUTHORIZATION_V1', issuedBy: 'CITY_HALL',
    source: 'EXPLICIT_WORK_GRANT', allowed: true, action: 'handoff',
    actor: 'LIGHT', workId: payload.workId, checkpointId: payload.checkpointId,
    workPassRef: payload.workPassRef, stationId: 'FACTORY_STATION',
    operation: payload.operation,
  };
  const accepted = await submit(payload);
  assert.equal(accepted.status, 202);
  const body = await accepted.json();
  assert.equal(body.receipt.actingActor, 'LIGHT');
  assert.equal(body.receipt.authorizationSource, 'EXPLICIT_WORK_GRANT');
  assert.equal(body.readback.boundaryVerified, true);
  assert.equal(body.readback.actingActor, 'LIGHT');
  const verified = await worker.fetch(await railRequest(
    'https://factory.example/station/readback/' + body.receipt.receiptId,
    { secret: RAIL_SECRET },
  ));
  assert.equal((await verified.json()).actingActor, 'LIGHT');
});

test('Worker rejects invalid Work Pass before creating a receipt', async () => {
  const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
  const worker = createFactoryWorker({ SOURCE_SHA: 'worker-sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET }, { recordStore });
  const payload = boundaryHandoff();
  payload.workPass.status = 'CANCELLED';
  const response = await worker.fetch(await railRequest('https://factory.example/station/receive', {
    method: 'POST',
    body: JSON.stringify(payload),
    secret: RAIL_SECRET,
    headers: { 'content-type': 'application/json' },
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, 'FACTORY_WORK_PASS_INACTIVE');
  assert.equal((await recordStore.list('factory/receipt-events')).length, 0);
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
