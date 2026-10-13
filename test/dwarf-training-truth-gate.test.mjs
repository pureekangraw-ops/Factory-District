import test from 'node:test';
import assert from 'node:assert/strict';
import deployedWorker from '../src/worker.mjs';
import { railRequest } from './support/rail-auth.mjs';

const RAIL_SECRET = 'test-rail-secret';

function r2Bucket() {
  const objects = new Map();
  return {
    async get(key) {
      const object = objects.get(key);
      return object ? { etag: object.etag, text: async () => object.body } : null;
    },
    async put(key, body) {
      const previous = objects.get(key);
      const etag = String(Number(previous?.etag || 0) + 1);
      objects.set(key, { body: String(body), etag });
      return { etag };
    },
    async list({ prefix = '' } = {}) {
      return { objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
}

function logicTrainingHandoff() {
  const passId = 'PASS:WORK-TRAINING-1:CP-01';
  return {
    workId: 'WORK-TRAINING-1',
    checkpointId: 'WORK-TRAINING-1:CP-01',
    workPassRef: `work-pass://${passId}`,
    workPass: {
      kind: 'WORK_PASS',
      version: 'WORK_PASS_V1',
      passId,
      workId: 'WORK-TRAINING-1',
      checkpointId: 'WORK-TRAINING-1:CP-01',
      actor: 'GO',
      status: 'ACTIVE',
      permissions: { actions: ['read', 'handoff', 'return'], handoff: [{ stationId: 'FACTORY_STATION' }] },
      authorityTransferred: false,
    },
    source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain: 'LOGIC',
    intent: 'DWARF_LOGIC_WORKBENCH_TRAINING',
    scope: ['EXECUTE:LOGIC'],
    expectedSourceSha: 'worker-sha-1',
  };
}

test('default Factory Worker does not report trainee placement as production Logic completion', async () => {
  const env = {
    SOURCE_SHA: 'worker-sha-1',
    METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET,
    RECORD_STORE: r2Bucket(),
  };
  const health = await deployedWorker.fetch(new Request('https://factory.example/health'), env);
  const healthBody = await health.json();
  assert.equal(healthBody.machinery.LOGIC.status, 'UNKNOWN');
  assert.equal(healthBody.machinery.LOGIC.reason, 'MACHINE_NOT_REGISTERED');

  const payload = logicTrainingHandoff();
  const response = await deployedWorker.fetch(await railRequest('https://factory.example/station/receive', {
    method: 'POST',
    body: JSON.stringify(payload),
    secret: RAIL_SECRET,
    headers: { 'content-type': 'application/json' },
  }), env);
  assert.equal(response.status, 409);
  const readback = await response.json();
  assert.equal(readback.receipt.status, 'UNKNOWN');
  assert.equal(readback.readback.reason, 'MACHINE_NOT_REGISTERED');
  assert.equal(readback.readback.domainCompleted, false);
  assert.equal(readback.readback.domainVerified, false);
  assert.equal(readback.readback.workId, payload.workId);
  assert.equal(readback.readback.checkpointId, payload.checkpointId);
  assert.equal(readback.readback.workPassRef, payload.workPassRef);
});
