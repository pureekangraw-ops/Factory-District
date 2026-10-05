import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineKernel } from '../src/machine-kernel.mjs';
import { createNodeWebAdapter, createCloudflareWorkerAdapter } from '../src/code-adapters.mjs';
import { runCodeMachine } from '../src/code-machine.mjs';
import { EXECUTION_STATE, RETURN_STATE } from '../src/machine-contract.mjs';
import { createInMemoryPersistence } from './support/in-memory-persistence.mjs';

function work(runId = 'RUN-CODE-1') {
  return {
    runId, workId: `WORK-${runId}`, machineId: 'CODE-MACHINE', machineVersion: '0.1.0', domain: 'CODE',
    ingress: { systemId: 'METROPOLIS', surfaceType: 'STATION', surfaceId: 'METROPOLIS-STATION' },
    destination: { systemId: 'FACTORY', surfaceType: 'OWNER', surfaceId: 'CODE' , ownerDomain: 'CODE' },
    transportRef: { kind: 'RAIL', linkId: 'METRO-FACTORY', trustBoundaryRef: 'TB-METRO-FACTORY' },
    requestedBy: { actorId: 'GO', authorityRef: 'AUTH-CODE', requestedAt: '2026-10-05T00:00:00Z' },
    subject: { subjectId: `CODE-${runId}`, subjectType: 'CODE_WORK', ownerSystem: 'GITHUB', lifecycleAuthorityRef: 'GITHUB-OWNER' },
  };
}

function kernel() {
  let n = 0;
  return createMachineKernel({ persistence: createInMemoryPersistence(), idFactory: () => `ID-${++n}`, clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })() });
}

function provider(options = {}) {
  const order = [];
  const sourceSha = 'source-sha-1';
  const common = (step, result) => async () => { order.push(step); return { status: 'PASS', evidenceRef: `evidence://code/${step.toLowerCase()}`, ...result }; };
  return {
    order,
    inspectRepository: async () => { order.push('inspectRepository'); return { status: 'READY', sourceSha, repo: 'owner/repo', branch: 'feature/code' }; },
    planChange: common('planChange', { planRef: 'plan://1' }),
    executeChange: common('executeChange', { commitSha: sourceSha }),
    runTests: common('runTests', { testRef: 'test://1' }),
    build: common('build', { artifactRef: 'artifact://1', sourceSha }),
    inspectArtifact: common('inspectArtifact', { artifactRef: 'artifact://1', sourceSha }),
    ciCheckpoint: common('ciCheckpoint', { ciRef: 'ci://1' }),
    gate: async () => { order.push('gate'); return options.gateFail ? { status: 'FAIL', reason: 'GATE_DENIED' } : { status: 'PASS', gateRef: 'gate://1' }; },
    deploy: async () => { order.push('deploy'); return { status: 'PASS', deploymentRef: 'deployment://1', sourceSha }; },
    verifyRuntime: async () => { order.push('verifyRuntime'); return { status: 'PASS', runtimeSha: options.runtimeSha || sourceSha, runtimeRef: 'runtime://1', evidenceRef: 'evidence://runtime/1' }; },
  };
}

test('CODE machinery runs Node/Web pipeline through Gate, Deploy and runtime Version Gate', async () => {
  const p = provider();
  const result = await runCodeMachine({ kernel: kernel(), adapter: createNodeWebAdapter(p), work: work() });
  assert.equal(result.run.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(result.run.returnState, RETURN_STATE.RETURNED);
  assert.deepEqual(p.order, ['inspectRepository', 'planChange', 'executeChange', 'runTests', 'build', 'inspectArtifact', 'ciCheckpoint', 'gate', 'deploy', 'verifyRuntime']);
  assert.equal(result.runtime.runtimeSha, result.repository.sourceSha);
});

test('Cloudflare Worker adapter uses the same CODE contract', () => {
  const p = provider();
  const adapter = createCloudflareWorkerAdapter(p);
  assert.equal(adapter.target, 'CLOUDFLARE_WORKER');
});

test('failed Gate blocks deploy and returns recovery state', async () => {
  const p = provider({ gateFail: true });
  const result = await runCodeMachine({ kernel: kernel(), adapter: createNodeWebAdapter(p), work: work('RUN-GATE') });
  assert.equal(result.run.executionState, EXECUTION_STATE.BLOCKED);
  assert.equal(result.run.returnState, RETURN_STATE.RETURNED);
  assert.equal(p.order.includes('deploy'), false);
});

test('runtime SHA mismatch cannot become COMPLETE', async () => {
  const p = provider({ runtimeSha: 'stale-runtime-sha' });
  const result = await runCodeMachine({ kernel: kernel(), adapter: createNodeWebAdapter(p), work: work('RUN-MISMATCH') });
  assert.equal(result.run.executionState, EXECUTION_STATE.UNKNOWN);
  assert.equal(result.run.returnState, RETURN_STATE.RETURNED);
});
