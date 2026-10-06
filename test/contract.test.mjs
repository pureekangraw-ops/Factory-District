import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoff, FACTORY_STATION_ID } from '../src/contract.mjs';

test('handoff targets Factory Station and Factory Hall, not an internal backend', () => {
  const handoff = createHandoff({
    workId: 'WORK-CODE-1',
    checkpointId: 'CP-1',
    source: { stationId: 'METROPOLIS-STATION', system: 'METROPOLIS' },
    target: { stationId: FACTORY_STATION_ID, system: 'FACTORY', component: 'FACTORY_HALL' },
    ownerDomain: 'CODE',
    intent: 'IMPLEMENT',
    scope: ['EXECUTE:CODE'],
    requestedAt: '2026-10-05T00:00:00Z',
  });
  assert.equal(handoff.kind, 'FACTORY_HANDOFF');
  assert.equal(handoff.target.component, 'FACTORY_HALL');
  assert.equal(Object.hasOwn(handoff, 'token'), false);
});

test('direct Postal or backend targets are rejected', () => {
  assert.throws(() => createHandoff({
    workId: 'WORK-1', checkpointId: 'CP-1',
    source: { stationId: 'S', system: 'METROPOLIS' },
    target: { stationId: 'POST_OFFICE', system: 'FACTORY', component: 'POST_OFFICE' },
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
