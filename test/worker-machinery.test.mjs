import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

const handoff = { workId: 'WORK-MACHINE', checkpointId: 'CP-1', source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' }, target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' }, ownerDomain: 'CODE', intent: 'EXECUTE', scope: ['EXECUTE:CODE'], expectedSourceSha: 'sha-1' };
const store = () => createDurableStore({ driver: createInMemoryDurableDriver() });
const request = () => new Request('https://factory.example/station/receive', { method: 'POST', body: JSON.stringify(handoff) });
test('production execution without a machine runner is UNKNOWN, not a verified skeleton', async () => {
  const worker = createFactoryWorker({ SOURCE_SHA: 'sha-1' }, { recordStore: store() });
  const result = await worker.fetch(request());
  const body = await result.json();
  assert.equal(result.status, 409);
  assert.equal(body.receipt.status, 'UNKNOWN');
  assert.equal(body.receipt.reason, 'MACHINE_NOT_REGISTERED');
});
test('Worker runs PIXIE machinery and persists its correlated output for readback', async () => {
  let received;
  const worker = createFactoryWorker({ SOURCE_SHA: 'sha-1' }, { recordStore: store(), domainRunners: { CODE: async ({ work, actorRef }) => {
    received = { work, actorRef };
    return { run: { workId: work.workId, checkpointId: work.checkpointId, executionState: 'COMPLETE', returnState: 'RETURNED', evidenceRefs: ['evidence://machine-1'] }, output: { artifactRef: 'artifact://machine-1' } };
  } } });
  const body = await (await worker.fetch(request())).json();
  assert.equal(received.actorRef, 'PIXIE');
  assert.equal(received.work.workId, handoff.workId);
  assert.equal(body.readback.domainCompleted, true);
  const persisted = await (await worker.fetch(new Request(`https://factory.example/station/readback/${body.receipt.receiptId}`))).json();
  assert.equal(persisted.machineResult.output.artifactRef, 'artifact://machine-1');
  assert.equal(persisted.machineResult.run.workId, handoff.workId);
});
for (const patch of [{ workId: 'OTHER' }, { returnState: 'PENDING' }, { evidenceRefs: [] }]) {
  test(`Worker does not complete unverifiable machinery ${JSON.stringify(patch)}`, async () => {
    const worker = createFactoryWorker({ SOURCE_SHA: 'sha-1' }, { recordStore: store(), domainRunners: { CODE: async () => ({ run: { workId: handoff.workId, checkpointId: handoff.checkpointId, executionState: 'COMPLETE', returnState: 'RETURNED', evidenceRefs: ['evidence://1'], ...patch } }) } });
    const body = await (await worker.fetch(request())).json();
    assert.equal(body.readback.domainCompleted, false);
    assert.equal(body.receipt.status, 'UNKNOWN');
  });
}
