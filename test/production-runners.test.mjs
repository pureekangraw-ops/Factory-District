import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionRunners } from '../src/production-runners.mjs';

test('production runner registration is explicit and absent runners stay unknown', () => {
  const result = createProductionRunners({});
  assert.deepEqual(Object.keys(result.runners), []);
  assert.equal(result.readiness.CODE.reason, 'MACHINE_NOT_REGISTERED');
  assert.equal(result.readiness.VISUAL.reason, 'MACHINE_NOT_REGISTERED');
  assert.equal(result.readiness.LOGIC.reason, 'MACHINE_NOT_REGISTERED');
});

test('configured runner uses the existing PIXIE handoff without carrying credentials', async () => {
  let request;
  const result = createProductionRunners({ CODE_RUNNER_URL: 'https://code.example/' }, { fetchImpl: async (url, init) => {
    request = { url, init };
    return Response.json({ run: { workId: 'WORK-1', executionState: 'COMPLETE', returnState: 'RETURNED', verificationRef: 'verify://1', returnRef: 'return://1', evidenceRefs: ['evidence://1'] }, output: { artifactRef: 'artifact://1' } });
  } });
  const response = await result.runners.CODE({ work: { workId: 'WORK-1' }, actorRef: 'PIXIE' });
  assert.equal(result.readiness.CODE.status, 'UNKNOWN');
  assert.equal(result.readiness.CODE.endpointConfigured, true);
  assert.equal(request.url, 'https://code.example/execute');
  assert.equal(JSON.parse(request.init.body).actorRef, 'PIXIE');
  assert.equal(Object.hasOwn(JSON.parse(request.init.body), 'token'), false);
  assert.equal(response.output.artifactRef, 'artifact://1');
});

test('runner HTTP failure is returned as UNKNOWN', async () => {
  const result = createProductionRunners({ CODE_RUNNER_URL: 'https://code.example' }, { fetchImpl: async () => new Response('{}', { status: 503 }) });
  const response = await result.runners.CODE({ work: { workId: 'WORK-2' } });
  assert.deepEqual(response, { status: 'UNKNOWN', reason: 'RUNNER_HTTP_503', runnerResponse: {} });
});
