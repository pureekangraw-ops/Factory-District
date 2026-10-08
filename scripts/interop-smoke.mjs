import assert from 'node:assert/strict';
import { createFactoryRailAdapter, FACTORY_STATION_PROTOCOL } from '../interop/metropolis/src/stations/factory.mjs';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from '../test/support/in-memory-durable-driver.mjs';

// Offline interop proof: real sender/receiver code, no network, no production credentials.
const secret = 'INTEROP_TEST_ONLY_NOT_A_PRODUCTION_CREDENTIAL';
const sourceSha = '1234567890abcdef1234567890abcdef12345678';
const workId = 'WORK-OFFLINE-INTEROP-1';
const checkpointId = 'WORK-OFFLINE-INTEROP-1:CP-01';
const passId = 'PASS:WORK-OFFLINE-INTEROP-1:CP-01';
const workPassRef = 'work-pass://' + passId;
const workPass = {
  kind: 'WORK_PASS',
  version: 'WORK_PASS_V1',
  passId, workId, checkpointId,
  actor: 'GO',
  status: 'ACTIVE',
  permissions: {
    actions: ['read', 'handoff', 'return'],
    handoff: [{ stationId: 'FACTORY_STATION' }],
  },
  authorityTransferred: false,
};
const input = {
  workId, checkpointId, workPassRef, workPass,
  source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
  target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' },
  ownerDomain: 'CODE',
  intent: 'LIVE_E2E_BOUNDARY_HANDOFF',
  scope: ['EXECUTE:CODE'],
  expectedSourceSha: sourceSha,
};
const recordStore = createDurableStore({ driver: createInMemoryDurableDriver() });
const worker = createFactoryWorker({
  SOURCE_SHA: sourceSha, METROPOLIS_FACTORY_RAIL_SECRET: secret,
}, { recordStore });
let requested = 0;
const fetchImpl = (url, init) => {
  requested += 1;
  return worker.fetch(new Request(url, init));
};
const adapter = createFactoryRailAdapter({
  baseUrl: 'https://factory.interop.invalid',
  sharedSecret: secret, fetchImpl,
});
const probe = await adapter.probe({
  station: { stationId: 'FACTORY_STATION', ownerSystem: 'FACTORY' },
  rail: { railId: 'RAIL_FACTORY' },
});
assert.equal(probe.status, 'READY');
assert.equal(probe.runtime.sourceSha, sourceSha);
assert.equal(probe.runtime.transport.protocol, FACTORY_STATION_PROTOCOL);
assert.equal(probe.readback.supported, true);

const transport = { payload: input };
const dispatched = await adapter.dispatch({ transport });
assert.equal(dispatched.accepted, true);
assert.ok(dispatched.receiptId);
const readback = await adapter.readback({ transport, receipt: dispatched });
assert.equal(readback.verified, true, 'Both sides verify Work/Checkpoint/Work Pass/source SHA');
assert.equal(readback.workId, workId);
assert.equal(readback.checkpointId, checkpointId);
assert.equal(readback.workPassRef, workPassRef);
assert.equal(readback.domainVerified, false, 'A verified boundary is NOT verified domain execution');
assert.ok(readback.evidenceRef);
assert.equal((await recordStore.list('factory/receipt-events')).length, 1);

// Wrong credentials cannot mint a new receipt; failure is fail-closed.
const unauthorized = await worker.fetch(new Request('https://factory.interop.invalid/station/receive', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
}));
assert.equal(unauthorized.status, 400);
assert.equal((await recordStore.list('factory/receipt-events')).length, 1);

// Stale signed traffic is rejected, even when signed with the correct fixture key.
const staleAdapter = createFactoryRailAdapter({
  baseUrl: 'https://factory.interop.invalid', sharedSecret: secret, fetchImpl,
  epochMs: () => Date.now() - (10 * 60 * 1000),
});
await assert.rejects(() => staleAdapter.dispatch({ transport }), /FACTORY_HANDOFF_NOT_ACCEPTED/);
assert.equal((await recordStore.list('factory/receipt-events')).length, 1);
console.log(JSON.stringify({
  probe: 'PASS', authentication: 'PASS', boundaryReceipt: 'PASS',
  sourceCorrelation: 'PASS', unauthorizedDenied: 'PASS', expiredDenied: 'PASS',
  domainExecutionVerified: false, externalTraffic: false, requests: requested,
}));
