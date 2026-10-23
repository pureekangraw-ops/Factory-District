import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoff, FACTORY_STATION_ID } from '../src/contract.mjs';

function workPass(workId = 'WORK-CODE-1', checkpointId = 'CP-1', overrides = {}) {
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

test('handoff targets Factory Station and Factory Hall, validates Work Pass, and persists only its reference', () => {
  const pass = workPass();
  const handoff = createHandoff({
    workId: 'WORK-CODE-1',
    checkpointId: 'CP-1',
    workPass: pass,
    workPassRef: `work-pass://${pass.passId}`,
    source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
    target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain: 'CODE',
    intent: 'IMPLEMENT',
    scope: ['EXECUTE:CODE'],
    requestedAt: '2026-10-05T00:00:00Z',
  });
  assert.equal(handoff.kind, 'FACTORY_HANDOFF');
  assert.equal(handoff.target.component, 'FACTORY_HALL');
  assert.equal(handoff.workPassRef, `work-pass://${pass.passId}`);
  assert.equal(Object.hasOwn(handoff, 'workPass'), false);
  assert.equal(Object.hasOwn(handoff, 'token'), false);
});

test('direct PIXIE or backend targets are rejected before Work is created', () => {
  assert.throws(() => createHandoff({
    workId: 'WORK-1', checkpointId: 'CP-1',
    source: { stationId: 'S', system: 'METROPOLIS' },
    target: { stationId: 'PIXIE', system: 'FACTORY', component: 'PIXIE' },
    ownerDomain: 'CODE', intent: 'IMPLEMENT', scope: ['EXECUTE:CODE'], requestedAt: 'now',
  }), /TARGET_MUST_BE_FACTORY_STATION/);
});

test('credentials cannot travel inside the handoff envelope', () => {
  assert.throws(() => createHandoff({
    workId: 'WORK-1', checkpointId: 'CP-1',
    source: { stationId: 'S', system: 'METROPOLIS' },
    target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain: 'CODE', intent: 'IMPLEMENT', scope: ['EXECUTE:CODE'], token: 'secret', requestedAt: 'now',
  }), /HANDOFF_MUST_NOT_CARRY_CREDENTIALS/);
});
