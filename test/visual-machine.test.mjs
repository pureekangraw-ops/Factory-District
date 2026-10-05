import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineKernel } from '../src/machine-kernel.mjs';
import { createInMemoryPersistence } from './support/in-memory-persistence.mjs';
import { createUiWebAdapter, createWallpaperAdapter, createIconAdapter } from '../src/visual-adapters.mjs';
import { runVisualMachine } from '../src/visual-machine.mjs';
import { EXECUTION_STATE, RETURN_STATE } from '../src/machine-contract.mjs';

function work(runId = 'RUN-VISUAL-1') {
  return {
    runId, workId: `WORK-${runId}`, machineId: 'VISUAL-MACHINE', machineVersion: '0.1.0', domain: 'VISUAL', visualTarget: 'UI_WEB',
    ingress: { systemId: 'METROPOLIS', surfaceType: 'STATION', surfaceId: 'METROPOLIS-STATION' },
    destination: { systemId: 'FACTORY', surfaceType: 'OWNER', surfaceId: 'VISUAL', ownerDomain: 'VISUAL' },
    transportRef: { kind: 'RAIL', linkId: 'METRO-FACTORY', trustBoundaryRef: 'TB-METRO-FACTORY' },
    requestedBy: { actorId: 'GO', authorityRef: 'AUTH-VISUAL', requestedAt: '2026-10-05T00:00:00Z' },
    subject: { subjectId: `VISUAL-${runId}`, subjectType: 'VISUAL_WORK', ownerSystem: 'VISUAL', lifecycleAuthorityRef: 'VISUAL-OWNER' },
  };
}

function kernel() {
  let n = 0;
  return createMachineKernel({ persistence: createInMemoryPersistence(), idFactory: () => `ID-${++n}`, clock: (() => { let i = 0; return () => `2026-10-05T00:00:0${i++}Z`; })() });
}

function provider(options = {}) {
  const order = [];
  let comparisons = 0;
  const common = (step, result = {}) => async () => { order.push(step); return { status: 'PASS', evidenceRef: `evidence://visual/${step.toLowerCase()}`, ...result }; };
  return {
    order,
    inspectInput: common('inspectInput', { inputRef: 'input://1' }),
    interpretDesign: common('interpretDesign', { designVersion: 'design-1', contractRef: 'design://1' }),
    compose: common('compose', { compositionRef: 'composition://1' }),
    createOrEdit: common('createOrEdit', { draftRef: 'draft://1' }),
    render: common('render', { renderRef: 'render://1' }),
    inspectVisual: common('inspectVisual', { inspectionRef: 'inspection://1' }),
    compare: async () => { order.push('compare'); comparisons += 1; return options.correctFirst || comparisons > 1 ? { status: 'PASS', comparisonRef: 'compare://pass' } : { status: 'NEEDS_CORRECTION', comparisonRef: 'compare://needs-correction' }; },
    correct: common('correct', { correctionRef: 'correction://1' }),
    exportOutput: common('exportOutput', { outputRef: 'output://1' }),
    verifyFinalOutput: common('verifyFinalOutput', { outputRef: 'output://1', designVersion: options.designVersion || 'design-1', evidenceRef: 'evidence://visual/final' }),
  };
}

test('VISUAL machinery completes UI/Web pipeline with final output verification', async () => {
  const p = provider({ correctFirst: true });
  const result = await runVisualMachine({ kernel: kernel(), adapter: createUiWebAdapter(p), work: work() });
  assert.equal(result.run.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(result.run.returnState, RETURN_STATE.RETURNED);
  assert.equal(result.finalOutput.designVersion, 'design-1');
  assert.equal(p.order.includes('correct'), false);
  assert.deepEqual(p.order, ['inspectInput', 'interpretDesign', 'compose', 'createOrEdit', 'render', 'inspectVisual', 'compare', 'exportOutput', 'verifyFinalOutput']);
});

test('VISUAL correction path re-renders and compares again before export', async () => {
  const p = provider();
  const result = await runVisualMachine({ kernel: kernel(), adapter: createUiWebAdapter(p, 'MANUAL'), work: work('RUN-CORRECT') });
  assert.equal(result.run.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(p.order.filter((step) => step === 'compare').length, 2);
  assert.equal(p.order.includes('correct'), true);
  assert.ok(p.order.indexOf('correct') < p.order.lastIndexOf('compare'));
});

test('Wallpaper and Icon use the same pipeline contract', async () => {
  const wallpaper = await runVisualMachine({ kernel: kernel(), adapter: createWallpaperAdapter(provider({ correctFirst: true })), work: work('RUN-WALLPAPER') });
  const icon = await runVisualMachine({ kernel: kernel(), adapter: createIconAdapter(provider({ correctFirst: true })), work: work('RUN-ICON') });
  assert.equal(wallpaper.run.executionState, EXECUTION_STATE.COMPLETE);
  assert.equal(icon.run.executionState, EXECUTION_STATE.COMPLETE);
});

test('final output design-version mismatch cannot become COMPLETE', async () => {
  const result = await runVisualMachine({ kernel: kernel(), adapter: createUiWebAdapter(provider({ correctFirst: true, designVersion: 'stale-design' })), work: work('RUN-MISMATCH') });
  assert.equal(result.run.executionState, EXECUTION_STATE.UNKNOWN);
  assert.equal(result.run.returnState, RETURN_STATE.RETURNED);
});
