import { EXECUTION_STATE, FAILURE_CLASS } from './machine-contract.mjs';
import { assertVisualAdapter, VISUAL_STATUS, VISUAL_STEP } from './visual-contract.mjs';

class VisualMachineError extends Error {
  constructor(message, failureClass = FAILURE_CLASS.EXECUTION_ERROR, targetState = null) {
    super(message);
    this.name = 'VisualMachineError';
    this.failureClass = failureClass;
    this.targetState = targetState;
  }
}

function evidenceFor(step, result) {
  const contentRef = result?.evidenceRef || result?.outputRef || result?.renderRef || result?.comparisonRef || result?.correctionRef;
  if (!contentRef) return null;
  const scope = step === VISUAL_STEP.FINAL_OUTPUT_VERIFY ? 'ARTIFACT' : step === VISUAL_STEP.COMPARE || step === VISUAL_STEP.VISUAL_INSPECT ? 'EXECUTION' : 'ARTIFACT';
  return { kind: `VISUAL_${step}`, verificationScope: scope, source: { systemId: 'VISUAL_MACHINE', surfaceId: step }, contentRef, metadata: { status: result.status || 'UNKNOWN' } };
}

function requirePass(result, step) {
  if (!result || ![VISUAL_STATUS.PASS, VISUAL_STATUS.READY, 'SUCCESS', 'VERIFIED', 'ACCEPTED'].includes(result.status)) {
    throw new VisualMachineError(`${step}_NOT_PASSED`, step === VISUAL_STEP.FINAL_OUTPUT_VERIFY ? FAILURE_CLASS.VERIFICATION_FAILED : FAILURE_CLASS.EXECUTION_ERROR);
  }
  return result;
}

export async function runVisualMachine({ kernel, adapter, work, actorRef = 'DWARF' } = {}) {
  assertVisualAdapter(adapter);
  if (!kernel || typeof kernel.receive !== 'function') throw new TypeError('kernel_REQUIRED');
  const steps = [];
  const evidence = [];
  let run = await kernel.receive(work);

  const methodFor = {
    [VISUAL_STEP.INPUT_INSPECT]: 'inspectInput',
    [VISUAL_STEP.INTERPRET]: 'interpretDesign',
    [VISUAL_STEP.COMPOSE]: 'compose',
    [VISUAL_STEP.CREATE_EDIT]: 'createOrEdit',
    [VISUAL_STEP.RENDER]: 'render',
    [VISUAL_STEP.VISUAL_INSPECT]: 'inspectVisual',
    [VISUAL_STEP.COMPARE]: 'compare',
    [VISUAL_STEP.CORRECT]: 'correct',
    [VISUAL_STEP.EXPORT]: 'exportOutput',
    [VISUAL_STEP.FINAL_OUTPUT_VERIFY]: 'verifyFinalOutput',
  };

  const call = async (step, input, { required = true } = {}) => {
    const result = await adapter[methodFor[step]](input);
    steps.push({ step, status: result?.status || 'UNKNOWN', result });
    if (required) requirePass(result, step);
    const item = evidenceFor(step, result);
    if (item) evidence.push(item);
    return result;
  };

  async function settleFailure(error) {
    const current = await kernel.load(run.runId);
    if ([EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(current.executionState)) {
      run = await kernel.recordFailure(current, { class: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR, code: error.code || error.message, message: error.message, retryable: false, safeToRetry: false, requiresManual: error.targetState === 'BLOCKED', confidence: 'CONFIRMED' }, actorRef, error.targetState);
    } else run = current;
    if (![EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(run.executionState)) {
      run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'VISUAL_MACHINE_RECOVERY' });
    }
    return { run, steps, evidence, error: { code: error.code || error.message, message: error.message, failureClass: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR } };
  }

  try {
    run = await kernel.interpret(run.runId, { planRef: `plan://visual/${run.workId}`, actorRef });
    run = await kernel.startAttempt(run.runId, { executorRef: `visual-machine://${adapter.target}`, actorRef });
    const input = await call(VISUAL_STEP.INPUT_INSPECT, { work, run, target: adapter.target, mode: adapter.mode });
    const interpretation = await call(VISUAL_STEP.INTERPRET, { work, run, input });
    const composition = await call(VISUAL_STEP.COMPOSE, { work, run, input, interpretation });
    const creation = await call(VISUAL_STEP.CREATE_EDIT, { work, run, composition });
    let render = await call(VISUAL_STEP.RENDER, { work, run, creation });
    let inspection = await call(VISUAL_STEP.VISUAL_INSPECT, { work, run, render });
    let comparison = await call(VISUAL_STEP.COMPARE, { work, run, interpretation, inspection }, { required: false });

    if (comparison.status === VISUAL_STATUS.NEEDS_CORRECTION) {
      const correction = await call(VISUAL_STEP.CORRECT, { work, run, comparison, inspection });
      render = await call(VISUAL_STEP.RENDER, { work, run, creation, correction });
      inspection = await call(VISUAL_STEP.VISUAL_INSPECT, { work, run, render });
      comparison = await call(VISUAL_STEP.COMPARE, { work, run, interpretation, inspection, correction }, { required: false });
    }
    if (comparison.status !== VISUAL_STATUS.PASS) throw new VisualMachineError('VISUAL_COMPARISON_NOT_PASSED', FAILURE_CLASS.VERIFICATION_FAILED);

    const output = await call(VISUAL_STEP.EXPORT, { work, run, render, inspection, comparison });
    const finalOutput = await call(VISUAL_STEP.FINAL_OUTPUT_VERIFY, { work, run, output, interpretation });
    const versionMatches = finalOutput.designVersion === interpretation.designVersion;
    evidence.push({ kind: 'VISUAL_OUTPUT_VERIFICATION', verificationScope: 'VERSION', source: { systemId: 'VISUAL_MACHINE', surfaceId: VISUAL_STEP.FINAL_OUTPUT_VERIFY }, contentRef: finalOutput.evidenceRef || output.outputRef, metadata: { expectedDesignVersion: interpretation.designVersion, observedDesignVersion: finalOutput.designVersion, matches: versionMatches } });
    run = await kernel.beginVerification(run.runId, { actorRef });
    run = await kernel.verify(run.runId, { evidence, verification: { status: versionMatches ? 'PASS' : 'UNKNOWN', observed: { designVersion: finalOutput.designVersion }, reason: versionMatches ? 'DESIGN_OUTPUT_VERSION_MATCH' : 'DESIGN_OUTPUT_VERSION_MISMATCH' }, actorRef });
    if (run.executionState === EXECUTION_STATE.COMPLETE) run = await kernel.returnRun(run.runId, { resultRefs: [output.outputRef], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'VISUAL_OWNER_REVIEW_COMPLETE' });
    else if (run.executionState === EXECUTION_STATE.UNKNOWN) run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'VISUAL_VERSION_RECONCILIATION_REQUIRED' });
    return { run, steps, evidence, interpretation, output, finalOutput };
  } catch (error) {
    return settleFailure(error);
  }
}
