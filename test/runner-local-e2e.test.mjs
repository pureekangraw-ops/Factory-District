import test from 'node:test';
import assert from 'node:assert/strict';
import workerEntry, { createFactoryWorker } from '../src/worker.mjs';
import { createR2RecordStore } from '../src/r2-record-store.mjs';
import { createDwarfLogicTraineeRunner } from '../src/dwarf-logic-trainee.mjs';
import { createLocalR2Bucket } from './support/local-r2-bucket.mjs';
import { railRequest } from './support/rail-auth.mjs';

// Calls only the in-process Worker fetch method, never global fetch/network.
// HMAC credentials, source identity, Work and R2 objects are TEST FIXTURES ONLY.
const SECRET = 'LOCAL-FICTIONAL-RAIL-SECRET-NOT-A-CREDENTIAL';
const SOURCE = 'LOCAL-SYNTHETIC-SOURCE-NOT-A-DEPLOYMENT';
function envelope(domain = 'LOGIC') {
  const workId = `LOCAL-E2E-${domain}`, checkpointId = 'CP-05';
  return {
    workId, checkpointId, ownerDomain: domain, intent: 'PLACE_DWARF_LOGIC_TRAINEE',
    scope: [`EXECUTE:${domain}`], inputRefs: ['fixture://local-input'], expectedSourceSha: SOURCE,
    source: { stationId: 'CITY', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'factory-district', component: 'FACTORY_HALL' },
    workPassRef: `work-pass://local-${domain}`,
    workPass: { kind: 'WORK_PASS', version: 'WORK_PASS_V1', passId: `local-${domain}`,
      workId, checkpointId, actor: 'GO', status: 'ACTIVE', authorityTransferred: false,
      permissions: { actions: ['handoff'], handoff: [{ stationId: 'FACTORY_STATION' }] } },
  };
}
function harness() {
  const bucket = createLocalR2Bucket();
  const env = { RECORD_STORE: bucket, SOURCE_SHA: SOURCE, METROPOLIS_FACTORY_RAIL_SECRET: SECRET };
  return { bucket, env, fetch: request => workerEntry.fetch(request, env) };
}
async function request(app, path, { body, secret = SECRET, ...options } = {}) {
  const response = await app.fetch(await railRequest(`https://local-fixture.invalid${path}`, {
    secret, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : '', ...options,
  }));
  return { status: response.status, body: await response.json() };
}
function placementRecords(bucket) {
  return [...bucket.records.entries()].filter(([key]) => key.startsWith('records/logic/trainees/'));
}

test('LOCAL ONLY: intake → signed dispatch → real bounded runner → persisted receipt → owner readback', async () => {
  const app = harness(), input = envelope();
  const preflight = await request(app, '/station/preflight', { body: input });
  assert.equal(preflight.status, 200);
  assert.equal(preflight.body.allowed, true);
  assert.equal(app.bucket.records.size, 0, 'preflight must be read-only');

  const dispatched = await request(app, '/station/receive', { body: input });
  assert.equal(dispatched.status, 202);
  const { receipt, readback } = dispatched.body;
  assert.equal(readback.domainVerified, true);
  assert.equal(readback.sourceSha, SOURCE);
  assert.equal(readback.machineResult.run.workId, input.workId);
  // CP-05 intentionally matches the existing runner. This test does not hide
  // the arbitrary-checkpoint gap tracked separately in open PR #31.
  assert.equal(readback.machineResult.run.checkpointId, input.checkpointId);
  assert.equal(readback.machineResult.trainee.placement.mode, 'TRAINING');
  assert.equal(readback.machineResult.trainee.placement.productionAuthority, false);
  assert.ok(Object.values(readback.machineResult.trainee.authority).every(value => value === false));
  assert.equal(receipt.workPassRef, input.workPassRef);

  const [placement] = placementRecords(app.bucket);
  assert.ok(placement);
  const persisted = JSON.parse(placement[1].text);
  assert.equal(persisted.version, 1);
  assert.deepEqual(persisted.value, readback.machineResult.trainee);
  assert.equal(readback.machineResult.run.verificationRef, `r2://factory/${placement[0]}`);
  const owner = await request(app, `/station/readback/${receipt.receiptId}`);
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.body, readback);
  assert.equal(owner.body.result.workId, input.workId);
  assert.equal(owner.body.result.checkpointId, input.checkpointId);
  assert.equal(owner.body.result.workPassRef, input.workPassRef);

  const duplicate = await request(app, '/station/receive', { body: input });
  assert.equal(duplicate.body.receipt.receiptId, receipt.receiptId);
  assert.deepEqual(duplicate.body.readback, owner.body);
  assert.equal(placementRecords(app.bucket).length, 1);
  assert.equal(JSON.parse(placementRecords(app.bucket)[0][1].text).version, 1);
  const conflict = await request(app, '/station/receive', { body: { ...input, inputRefs: ['fixture://changed'] } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.reason, 'FACTORY_WORK_SCOPE_CONFLICT');
});

test('LOCAL ONLY: default registration keeps LOGIC training and leaves CODE/VISUAL unknown', async () => {
  const app = harness();
  const health = await (await app.fetch(new Request('https://local-fixture.invalid/health'))).json();
  assert.equal(health.machinery.LOGIC.status, 'READY');
  for (const domain of ['CODE', 'VISUAL']) {
    assert.equal(health.machinery[domain].status, 'UNKNOWN');
    const result = await request(app, '/station/receive', { body: envelope(domain) });
    assert.equal(result.status, 409);
    assert.equal(result.body.receipt.reason, 'MACHINE_NOT_REGISTERED');
    assert.equal(result.body.readback.domainVerified, false);
  }
  assert.equal(placementRecords(app.bucket).length, 0);
});

test('LOCAL ONLY: unauthorized or stale dispatch cannot write records or execute', async () => {
  for (const kind of ['wrong-signature', 'stale-signature', 'cancelled-pass', 'wrong-checkpoint', 'authority-transfer']) {
    const app = harness(), body = envelope();
    const options = { body };
    if (kind === 'wrong-signature') options.secret = 'ANOTHER-FICTIONAL-SECRET';
    if (kind === 'stale-signature') options.timestamp = '1';
    if (kind === 'cancelled-pass') body.workPass.status = 'CANCELLED';
    if (kind === 'wrong-checkpoint') body.workPass.checkpointId = 'OTHER';
    if (kind === 'authority-transfer') body.workPass.authorityTransferred = true;
    const result = await request(app, '/station/receive', options);
    assert.ok([400, 401, 403].includes(result.status), kind);
    assert.equal(result.body.status, 'DENIED', kind);
    assert.equal(app.bucket.records.size, 0, kind);
  }
});

test('LOCAL ONLY: caller deadline and concurrent retry never replay an in-flight effect', { timeout: 2000 }, async () => {
  const bucket = createLocalR2Bucket(), store = createR2RecordStore(bucket);
  const runner = createDwarfLogicTraineeRunner({ store });
  let release, started, executions = 0;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const app = createFactoryWorker({ SOURCE_SHA: SOURCE, METROPOLIS_FACTORY_RAIL_SECRET: SECRET }, {
    recordStore: store, domainRunners: { LOGIC: async input => {
      executions++;
      started();
      await gate;
      return runner(input);
    } },
  });
  const first = request(app, '/station/receive', { body: envelope() });
  try {
    await entered;
    const callerDeadline = await Promise.race([first, new Promise(resolve => setTimeout(() => resolve('LOCAL_CALLER_TIMEOUT'), 5))]);
    assert.equal(callerDeadline, 'LOCAL_CALLER_TIMEOUT');
    const retries = await Promise.all(Array.from({ length: 8 }, () => request(app, '/station/receive', { body: envelope() })));
    for (const retry of retries) {
      assert.equal(retry.status, 409);
      assert.equal(retry.body.readback.reason, 'FACTORY_EFFECT_UNRECONCILED');
      assert.equal(retry.body.readback.domainVerified, false);
    }
    assert.equal(executions, 1);
  } finally { release(); }
  const completed = await first;
  assert.equal(completed.status, 202);
  assert.equal(completed.body.readback.domainVerified, true);
  const after = await request(app, '/station/receive', { body: envelope() });
  assert.equal(after.body.receipt.receiptId, completed.body.receipt.receiptId);
  assert.equal(executions, 1);
  assert.equal(placementRecords(bucket).length, 1);
});
