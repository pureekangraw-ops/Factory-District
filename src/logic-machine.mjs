import { EXECUTION_STATE, FAILURE_CLASS } from './machine-contract.mjs';
import { assertLogicAdapter, LOGIC_STATUS, LOGIC_STEP } from './logic-contract.mjs';

class LogicMachineError extends Error {
  constructor(message, failureClass = FAILURE_CLASS.EXECUTION_ERROR, targetState = null) { super(message); this.name = 'LogicMachineError'; this.failureClass = failureClass; this.targetState = targetState; }
}

function evidenceFor(step, result) {
  const contentRef = result?.evidenceRef || result?.resultRef || result?.simulationRef || result?.versionRef || result?.goldenRef;
  return contentRef ? { kind: `LOGIC_${step}`, verificationScope: step === LOGIC_STEP.VERSIONING ? 'VERSION' : 'EXECUTION', source: { systemId: 'LOGIC_MACHINE', surfaceId: step }, contentRef, metadata: { status: result.status || 'UNKNOWN' } } : null;
}
function requirePass(result, step) { if (!result || ![LOGIC_STATUS.PASS, LOGIC_STATUS.READY, 'SUCCESS', 'VERIFIED', 'ACCEPTED'].includes(result.status)) throw new LogicMachineError(`${step}_NOT_PASSED`, step === LOGIC_STEP.EVALUATION ? FAILURE_CLASS.VERIFICATION_FAILED : FAILURE_CLASS.EXECUTION_ERROR); return result; }

export async function runLogicMachine({ kernel, adapter, work, actorRef = 'DWARF' } = {}) {
  assertLogicAdapter(adapter);
  if (!kernel || typeof kernel.receive !== 'function') throw new TypeError('kernel_REQUIRED');
  const steps = [];
  const evidence = [];
  let run = await kernel.receive(work);
  const methodFor = { [LOGIC_STEP.DESIGN_BENCH]: 'designBench', [LOGIC_STEP.BUILD_BENCH]: 'buildBench', [LOGIC_STEP.DEVELOPMENT_BENCH]: 'developmentBench', [LOGIC_STEP.SIMULATION]: 'simulate', [LOGIC_STEP.GOLDEN_CASES]: 'runGoldenCases', [LOGIC_STEP.EVALUATION]: 'evaluate', [LOGIC_STEP.RCA]: 'rca', [LOGIC_STEP.QUALIFICATION]: 'qualifyAgent', [LOGIC_STEP.VERSIONING]: 'version' };
  const call = async (step, input, required = true) => { const result = await adapter[methodFor[step]](input); steps.push({ step, status: result?.status || 'UNKNOWN', result }); if (required) requirePass(result, step); const item = evidenceFor(step, result); if (item) evidence.push(item); return result; };
  async function settleFailure(error) {
    const current = await kernel.load(run.runId);
    if ([EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(current.executionState)) run = await kernel.recordFailure(current, { class: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR, code: error.code || error.message, message: error.message, retryable: false, safeToRetry: false, requiresManual: error.targetState === 'BLOCKED', confidence: 'CONFIRMED' }, actorRef, error.targetState);
    else run = current;
    if (![EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(run.executionState)) run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'LOGIC_MACHINE_RECOVERY' });
    return { run, steps, evidence, error: { code: error.code || error.message, message: error.message, failureClass: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR } };
  }
  try {
    run = await kernel.interpret(run.runId, { planRef: `plan://logic/${run.workId}`, actorRef });
    run = await kernel.startAttempt(run.runId, { executorRef: `logic-machine://${adapter.target}`, actorRef });
    const design = await call(LOGIC_STEP.DESIGN_BENCH, { work, run });
    const build = await call(LOGIC_STEP.BUILD_BENCH, { work, run, design });
    const development = await call(LOGIC_STEP.DEVELOPMENT_BENCH, { work, run, build });
    const simulation = await call(LOGIC_STEP.SIMULATION, { work, run, development });
    const golden = await call(LOGIC_STEP.GOLDEN_CASES, { work, run, simulation });
    let evaluation = await call(LOGIC_STEP.EVALUATION, { work, run, golden }, false);
    if (evaluation.status === LOGIC_STATUS.NEEDS_RCA) {
      const rca = await call(LOGIC_STEP.RCA, { work, run, evaluation }, true);
      evaluation = await call(LOGIC_STEP.EVALUATION, { work, run, golden, rca }, true);
    } else requirePass(evaluation, LOGIC_STEP.EVALUATION);
    const qualification = await call(LOGIC_STEP.QUALIFICATION, { work, run, evaluation }, true);
    const version = await call(LOGIC_STEP.VERSIONING, { work, run, evaluation, qualification });
    evidence.push({ kind: 'LOGIC_VERSION_VERIFICATION', verificationScope: 'VERSION', source: { systemId: 'LOGIC_MACHINE', surfaceId: LOGIC_STEP.VERSIONING }, contentRef: version.versionRef, metadata: { logicVersion: version.logicVersion } });
    run = await kernel.beginVerification(run.runId, { actorRef });
    run = await kernel.verify(run.runId, { evidence, verification: { status: version.status === LOGIC_STATUS.PASS ? 'PASS' : 'UNKNOWN', observed: { logicVersion: version.logicVersion }, reason: 'LOGIC_RUN_VERSION_VERIFICATION' }, actorRef });
    if (run.executionState === EXECUTION_STATE.COMPLETE) run = await kernel.returnRun(run.runId, { resultRefs: [version.versionRef], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'OWNER_QUALIFICATION_REVIEW' });
    else if (run.executionState === EXECUTION_STATE.UNKNOWN) run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'LOGIC_RUN_RECONCILIATION_REQUIRED' });
    return { run, steps, evidence, qualification, version };
  } catch (error) { return settleFailure(error); }
}
