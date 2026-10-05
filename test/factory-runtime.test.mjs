import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryRuntime } from '../src/factory-runtime.mjs';
import { FACTORY_STATION_ID } from '../src/contract.mjs';

const base = (ownerDomain, extra = {}) => ({
  workId: `WORK-${ownerDomain}`,
  checkpointId: 'CP-1',
  source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
  target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' },
  ownerDomain,
  intent: 'EXECUTE',
  scope: [`EXECUTE:${ownerDomain}`],
  requestedAt: '2026-10-05T00:00:00Z',
  ...extra,
});

function runtime(overrides = {}) {
  let n = 0;
  return createFactoryRuntime({
    sourceSha: 'abc123',
    idFactory: () => `id-${++n}`,
    clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })(),
    domainHandlers: {
      CODE: async ({ handoff }) => ({ domain: 'CODE', workId: handoff.workId, completed: false }),
      VISUAL: async () => ({ domain: 'VISUAL', completed: false }),
      LOGIC: async () => ({ domain: 'LOGIC', completed: false }),
    },
    ...overrides,
  });
}

test('health exposes exact source and runtime SHA', () => {
  assert.deepEqual(runtime().health(), {
    service: 'factory-district', stationId: FACTORY_STATION_ID, status: 'READY',
    sourceSha: 'abc123', runtimeSha: 'abc123', observedAt: '2026-10-05T00:00:00Z',
  });
});

test('CODE, VISUAL and LOGIC all travel through PIXIE and return evidence', async () => {
  const factory = runtime();
  for (const domain of ['CODE', 'VISUAL', 'LOGIC']) {
    const result = await factory.receive(base(domain));
    assert.equal(result.receipt.status, 'VERIFIED');
    assert.equal(result.receipt.outcome, 'VERIFIED');
    assert.equal(result.readback.verified, true);
    assert.match(result.readback.evidenceRef, /^evidence:\/\/factory\//);
    assert.equal(result.pixie.result.domain, domain);
  }
});

test('wrong scope fails closed as DENIED', async () => {
  const result = await runtime().receive(base('CODE', { scope: ['EXECUTE:VISUAL'] }));
  assert.equal(result.receipt.status, 'DENIED');
  assert.equal(result.receipt.reason, 'SCOPE_NOT_GRANTED');
  assert.equal(result.readback.verified, false);
});

test('missing destination is UNKNOWN, not fabricated success', async () => {
  const factory = runtime({ domainHandlers: { CODE: async () => ({ domain: 'CODE' }) } });
  const result = await factory.receive(base('LOGIC'));
  assert.equal(result.receipt.status, 'UNKNOWN');
  assert.equal(result.receipt.reason, 'DESTINATION_UNAVAILABLE');
  assert.equal(result.readback.verified, false);
});

test('source SHA mismatch is UNKNOWN', async () => {
  const result = await runtime().receive(base('CODE', { expectedSourceSha: 'stale-sha' }));
  assert.equal(result.receipt.status, 'UNKNOWN');
  assert.equal(result.receipt.reason, 'SHA_MISMATCH');
  assert.equal(result.readback.verified, false);
});

test('receipt is not completion: foundation result remains completed false', async () => {
  const result = await runtime().receive(base('CODE'));
  assert.equal(result.receipt.status, 'VERIFIED');
  assert.equal(result.pixie.result.completed, false);
});
