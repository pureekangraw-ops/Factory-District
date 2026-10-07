import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryRuntime } from '../src/factory-runtime.mjs';
import { FACTORY_STATION_ID } from '../src/contract.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';

function validPass(workId, checkpointId = 'CP-1', overrides = {}) {
  return {
    kind: 'WORK_PASS',
    version: 'WORK_PASS_V1',
    passId: `PASS:${workId}:${checkpointId}`,
    workId,
    checkpointId,
    actor: 'GO',
    status: 'ACTIVE',
    permissions: {
      actions: ['read', 'handoff', 'return'],
      handoff: [{ stationId: 'FACTORY_STATION' }],
    },
    authorityTransferred: false,
    ...overrides,
  };
}

const base = (ownerDomain, extra = {}) => {
  const workId = extra.workId || `WORK-${ownerDomain}`;
  const checkpointId = extra.checkpointId || 'CP-1';
  const pass = Object.hasOwn(extra, 'workPass') ? extra.workPass : validPass(workId, checkpointId);
  const ref = Object.hasOwn(extra, 'workPassRef')
    ? extra.workPassRef
    : pass ? `work-pass://${pass.passId}` : undefined;
  return {
    workId,
    checkpointId,
    workPass: pass,
    workPassRef: ref,
    source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
    target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain,
    intent: 'EXECUTE',
    scope: [`EXECUTE:${ownerDomain}`],
    requestedAt: '2026-10-05T00:00:00Z',
    ...extra,
  };
};

function runtime(overrides = {}) {
  let n = 0;
  return createFactoryRuntime({
    sourceSha: 'abc123', idFactory: () => `id-${++n}`, clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })(),
    domainHandlers: { CODE: async ({ handoff }) => ({ domain: 'CODE', workId: handoff.workId, completed: false }), VISUAL: async () => ({ domain: 'VISUAL', completed: false }), LOGIC: async () => ({ domain: 'LOGIC', completed: false }) },
    recordStore: createDurableStore({ driver: createInMemoryDurableDriver() }),
    ...overrides,
  });
}

test('health exposes exact source/runtime SHA and durable storage adapter', () => {
  const health = runtime().health();
  assert.equal(health.status, 'READY');
  assert.equal(health.sourceSha, 'abc123');
  assert.equal(health.runtimeSha, 'abc123');
  assert.deepEqual(health.storage, { status: 'READY', durability: 'ADAPTER' });
});

test('CODE, VISUAL and LOGIC use durable receipt/readback storage', async () => {
  const factory = runtime();
  for (const domain of ['CODE', 'VISUAL', 'LOGIC']) {
    const result = await factory.receive(base(domain));
    assert.equal(result.receipt.status, 'HANDOFF_VERIFIED');
    assert.equal(result.receipt.verificationScope, 'BOUNDARY_HANDOFF');
    assert.equal(result.readback.boundaryVerified, true);
    assert.equal((await factory.readback(result.receipt.receiptId)).boundaryVerified, true);
  }
});

test('missing durable store fails closed instead of creating runtime memory state', () => {
  assert.throws(() => createFactoryRuntime({ sourceSha: 'abc123', domainHandlers: {} }), /durableStore_REQUIRED/);
});

test('Factory boundary rejects missing Work Pass', async () => {
  const input = base('CODE');
  delete input.workPass;
  await assert.rejects(() => runtime().receive(input), /FACTORY_WORK_PASS_REQUIRED/);
});

test('Factory boundary rejects cancelled Work Pass', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { status: 'CANCELLED' }) })), /FACTORY_WORK_PASS_INACTIVE/);
});

test('Factory boundary rejects mismatched Work ID', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-OTHER', 'CP-1') })), /FACTORY_WORK_PASS_SCOPE_MISMATCH/);
});

test('Factory boundary rejects mismatched Checkpoint ID', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-OTHER') })), /FACTORY_WORK_PASS_SCOPE_MISMATCH/);
});

test('Factory boundary rejects wrong actor', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { actor: 'LIGHT' }) })), /FACTORY_WORK_PASS_ACTOR_INVALID/);
});

test('Factory boundary rejects missing handoff permission', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { permissions: { actions: ['read', 'return'], handoff: [{ stationId: 'FACTORY_STATION' }] } }) })), /FACTORY_WORK_PASS_ACTION_DENIED/);
});

test('Factory boundary rejects wrong Work Pass destination', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { permissions: { actions: ['handoff'], handoff: [{ stationId: 'OTHER_STATION' }] } }) })), /FACTORY_WORK_PASS_DESTINATION_DENIED/);
});

test('Factory boundary rejects Work Pass reference mismatch', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPassRef: 'work-pass://WRONG' })), /FACTORY_WORK_PASS_REF_MISMATCH/);
});

test('Factory boundary rejects authority transfer', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { authorityTransferred: true }) })), /FACTORY_WORK_PASS_AUTHORITY_TRANSFER_INVALID/);
});

test('Factory boundary rejects wrong Work Pass kind/version', async () => {
  await assert.rejects(() => runtime().receive(base('CODE', { workPass: validPass('WORK-CODE', 'CP-1', { version: 'WORK_PASS_V0' }) })), /FACTORY_WORK_PASS_VERSION_INVALID/);
});

test('valid Work Pass reference survives receipt, durable record, PIXIE result and readback without persisting the pass snapshot', async () => {
  let n = 0;
  const store = createDurableStore({ driver: createInMemoryDurableDriver() });
  const factory = createFactoryRuntime({
    sourceSha: 'abc123',
    idFactory: () => `id-${++n}`,
    clock: () => '2026-10-05T00:00:00Z',
    domainHandlers: { CODE: async ({ handoff }) => ({ domain: 'CODE', workId: handoff.workId, completed: false }) },
    recordStore: store,
  });
  const input = base('CODE');
  const result = await factory.receive(input);
  assert.equal(result.receipt.workPassRef, input.workPassRef);
  assert.equal(result.readback.workPassRef, input.workPassRef);
  assert.equal(result.pixie.workPassRef, input.workPassRef);
  assert.equal(result.pixie.evidence.workPassRef, input.workPassRef);

  const durable = await store.get(`factory/receipt/${result.receipt.receiptId}`);
  assert.equal(durable.value.handoff.workPassRef, input.workPassRef);
  assert.equal(Object.hasOwn(durable.value.handoff, 'workPass'), false);
  assert.equal(durable.value.receipt.workPassRef, input.workPassRef);
  assert.equal(durable.value.readback.workPassRef, input.workPassRef);
  assert.equal(durable.value.pixieResult.workPassRef, input.workPassRef);

  const readback = await factory.readback(result.receipt.receiptId);
  assert.equal(readback.workPassRef, input.workPassRef);
});

test('wrong scope remains DENIED with durable storage', async () => {
  const result = await runtime().receive(base('CODE', { scope: ['EXECUTE:VISUAL'] }));
  assert.equal(result.receipt.status, 'DENIED');
  assert.equal(result.receipt.reason, 'SCOPE_NOT_GRANTED');
  assert.equal(result.readback.boundaryVerified, false);
  assert.equal(result.readback.domainCompleted, false);
});

test('missing destination remains UNKNOWN, not fabricated success', async () => {
  const factory = runtime({ domainHandlers: { CODE: async () => ({ domain: 'CODE', completed: false }) } });
  const result = await factory.receive(base('LOGIC'));
  assert.equal(result.receipt.status, 'UNKNOWN');
  assert.equal(result.receipt.reason, 'DESTINATION_UNAVAILABLE');
  assert.equal(result.readback.boundaryVerified, false);
  assert.equal(result.readback.domainCompleted, false);
});

test('source SHA mismatch remains UNKNOWN with durable storage', async () => {
  const result = await runtime().receive(base('CODE', { expectedSourceSha: 'stale-sha' }));
  assert.equal(result.receipt.status, 'UNKNOWN');
  assert.equal(result.receipt.reason, 'SHA_MISMATCH');
  assert.equal(result.readback.boundaryVerified, false);
});

test('boundary handoff evidence remains distinct from domain completion', async () => {
  const result = await runtime().receive(base('CODE'));
  assert.equal(result.receipt.status, 'HANDOFF_VERIFIED');
  assert.equal(result.receipt.verificationScope, 'BOUNDARY_HANDOFF');
  assert.equal(result.receipt.domainCompleted, false);
  assert.equal(result.readback.verificationScope, 'BOUNDARY_HANDOFF');
  assert.equal(result.readback.domainCompleted, false);
  assert.equal(result.pixie.result.completed, false);
});
