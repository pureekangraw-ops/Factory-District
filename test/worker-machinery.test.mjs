import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { railRequest } from './support/rail-auth.mjs';

const RAIL_SECRET = 'test-rail-secret';
const pass = {
  kind: 'WORK_PASS',
  version: 'WORK_PASS_V1',
  passId: 'PASS:WORK-MACHINE:CP-1',
  workId: 'WORK-MACHINE',
  checkpointId: 'CP-1',
  actor: 'GO',
  status: 'ACTIVE',
  permissions: { actions: ['read', 'handoff', 'return'], handoff: [{ stationId: 'FACTORY_STATION' }] },
  authorityTransferred: false,
};
const handoff = { workId: 'WORK-MACHINE', checkpointId: 'CP-1', workPassRef: `work-pass://${pass.passId}`, workPass: pass, source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' }, target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' }, ownerDomain: 'CODE', intent: 'EXECUTE', scope: ['EXECUTE:CODE'], expectedSourceSha: 'sha-1' };
const store = () => createDurableStore({ driver: createInMemoryDurableDriver() });
const request = () => railRequest('https://factory.example/station/receive', {
  method: 'POST',
  body: JSON.stringify(handoff),
  secret: RAIL_SECRET,
  headers: { 'content-type': 'application/json' },
});
const workerEnv = { SOURCE_SHA: 'sha-1', METROPOLIS_FACTORY_RAIL_SECRET: RAIL_SECRET };

test('production execution without a machine runner is UNKNOWN, not a verified skeleton', async () => {
  const worker = createFactoryWorker(workerEnv, { recordStore: store() });
  const result = await worker.fetch(await request());
  const body = await result.json();
  assert.equal(result.status, 409);
  assert.equal(body.receipt.status, 'UNKNOWN');
  assert.equal(body.receipt.reason, 'MACHINE_NOT_REGISTERED');
  assert.equal(body.receipt.workPassRef, handoff.workPassRef);
});

test('Worker runs DWARF machinery and persists its correlated output for readback', async () => {
  let received;
  const worker = createFactoryWorker(workerEnv, { recordStore: store(), domainRunners: { CODE: async ({ work, actorRef }) => {
    received = { work, actorRef };
    return { run: { workId: work.workId, checkpointId: 'CP-05', executionState: 'COMPLETE', returnState: 'RETURNED', verificationRef: 'verification-1', returnRef: 'return-1', evidenceRefs: ['evidence://machine-1'] }, output: { artifactRef: 'artifact://machine-1' } };
  } } });
  const body = await (await worker.fetch(await request())).json();
  assert.equal(received.actorRef, 'DWARF-01');
  assert.equal(body.readback.mainRunner, 'DWARF-01');
  assert.equal(received.work.workId, handoff.workId);
  assert.equal(received.work.workPassRef, handoff.workPassRef);
  assert.equal(body.readback.domainCompleted, true);
  assert.equal(body.readback.workPassRef, handoff.workPassRef);
  const persisted = await (await worker.fetch(await railRequest(`https://factory.example/station/readback/${body.receipt.receiptId}`, { secret: RAIL_SECRET }))).json();
  assert.equal(persisted.machineResult.output.artifactRef, 'artifact://machine-1');
  assert.equal(persisted.machineResult.run.workId, handoff.workId);
  assert.equal(persisted.workPassRef, handoff.workPassRef);
});

for (const patch of [{ workId: 'OTHER' }, { returnState: 'PENDING' }, { evidenceRefs: [] }, { verificationRef: null }, { returnRef: null }]) {
  test(`Worker does not complete unverifiable machinery ${JSON.stringify(patch)}`, async () => {
    const worker = createFactoryWorker(workerEnv, { recordStore: store(), domainRunners: { CODE: async () => ({ run: { workId: handoff.workId, checkpointId: 'CP-05', executionState: 'COMPLETE', returnState: 'RETURNED', verificationRef: 'verification-1', returnRef: 'return-1', evidenceRefs: ['evidence://1'], ...patch } }) } });
    const body = await (await worker.fetch(await request())).json();
    assert.equal(body.readback.domainCompleted, false);
    assert.equal(body.receipt.status, 'UNKNOWN');
    assert.equal(body.readback.workPassRef, handoff.workPassRef);
  });
}
