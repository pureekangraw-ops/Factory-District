import { EXECUTION_STATE, FAILURE_CLASS } from './machine-contract.mjs';
import { assertCodeAdapter, CODE_STEP, CODE_STATUS } from './code-contract.mjs';

class CodeMachineError extends Error {
  constructor(message, failureClass = FAILURE_CLASS.EXECUTION_ERROR, targetState = null) {
    super(message);
    this.name = 'CodeMachineError';
    this.failureClass = failureClass;
    this.targetState = targetState;
  }
}

function evidenceFor(step, result) {
  const contentRef = result?.evidenceRef || result?.artifactRef || result?.deploymentRef || result?.runtimeRef;
  if (!contentRef) return null;
  return {
    kind: `CODE_${step}`,
    verificationScope: step === CODE_STEP.RUNTIME_VERIFY ? 'RUNTIME' : step === CODE_STEP.DEPLOY ? 'DEPLOYMENT' : step === CODE_STEP.INSPECT_ARTIFACT ? 'ARTIFACT' : 'EXECUTION',
    source: { systemId: 'CODE_MACHINE', surfaceId: step },
    contentRef,
    metadata: { status: result.status || 'UNKNOWN' },
  };
}

function requireStep(result, step) {
  if (!result || ![CODE_STATUS.PASS, CODE_STATUS.READY, 'SUCCESS', 'VERIFIED', 'ACCEPTED'].includes(result.status)) {
    const failureClass = step === CODE_STEP.GATE ? FAILURE_CLASS.VERSION_MISMATCH : step === CODE_STEP.RUNTIME_VERIFY ? FAILURE_CLASS.VERIFICATION_FAILED : FAILURE_CLASS.EXECUTION_ERROR;
    throw new CodeMachineError(`${step}_NOT_PASSED`, failureClass, step === CODE_STEP.GATE ? 'BLOCKED' : null);
  }
  return result;
}

function checkSha(result, expectedSha, step) {
  if (result?.sourceSha && result.sourceSha !== expectedSha) throw new CodeMachineError(`${step}_SOURCE_SHA_MISMATCH`, FAILURE_CLASS.VERSION_MISMATCH, 'BLOCKED');
}

export async function runCodeMachine({ kernel, adapter, work, actorRef = 'PIXIE' } = {}) {
  assertCodeAdapter(adapter);
  if (!kernel || typeof kernel.receive !== 'function') throw new TypeError('kernel_REQUIRED');
  const steps = [];
  const evidence = [];
  let run = await kernel.receive(work);

  const call = async (step, input, { required = true } = {}) => {
    const result = await adapter[stepName(step)](input);
    steps.push({ step, status: result?.status || 'UNKNOWN', result });
    if (required) requireStep(result, step);
    const item = evidenceFor(step, result);
    if (item) evidence.push(item);
    return result;
  };

  function stepName(step) {
    return {
      [CODE_STEP.INSPECT_REPOSITORY]: 'inspectRepository',
      [CODE_STEP.PLAN_CHANGE]: 'planChange',
      [CODE_STEP.EXECUTE_CHANGE]: 'executeChange',
      [CODE_STEP.RUN_TESTS]: 'runTests',
      [CODE_STEP.BUILD]: 'build',
      [CODE_STEP.INSPECT_ARTIFACT]: 'inspectArtifact',
      [CODE_STEP.CI_CHECKPOINT]: 'ciCheckpoint',
      [CODE_STEP.GATE]: 'gate',
      [CODE_STEP.DEPLOY]: 'deploy',
      [CODE_STEP.RUNTIME_VERIFY]: 'verifyRuntime',
    }[step];
  }

  async function settleFailure(error) {
    const current = await kernel.load(run.runId);
    if ([EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(current.executionState)) {
      run = await kernel.recordFailure(current, {
        class: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR,
        code: error.code || error.message,
        message: error.message,
        retryable: false,
        safeToRetry: false,
        requiresManual: error.targetState === 'BLOCKED',
        confidence: 'CONFIRMED',
      }, actorRef, error.targetState);
    } else {
      run = current;
    }
    if (![EXECUTION_STATE.RECEIVED, EXECUTION_STATE.INTERPRETED, EXECUTION_STATE.EXECUTING, EXECUTION_STATE.VERIFYING].includes(run.executionState)) {
      run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: [...run.evidenceRefs, ...evidence.map((item) => item.contentRef)], boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'CODE_MACHINE_RECOVERY' });
    }
    return { run, steps, evidence, error: { code: error.code || error.message, message: error.message, failureClass: error.failureClass || FAILURE_CLASS.EXECUTION_ERROR } };
  }

  try {
    run = await kernel.interpret(run.runId, { planRef: `plan://code/${run.workId}`, actorRef });
    run = await kernel.startAttempt(run.runId, { executorRef: `code-machine://${adapter.target}`, actorRef });
    const repository = await call(CODE_STEP.INSPECT_REPOSITORY, { work, run });
    const plan = await call(CODE_STEP.PLAN_CHANGE, { work, run, repository });
    const execution = await call(CODE_STEP.EXECUTE_CHANGE, { work, run, repository, plan });
    const tests = await call(CODE_STEP.RUN_TESTS, { work, run, repository, plan, execution });
    const build = await call(CODE_STEP.BUILD, { work, run, repository, execution, tests });
    checkSha(build, repository.sourceSha, CODE_STEP.BUILD);
    const artifact = await call(CODE_STEP.INSPECT_ARTIFACT, { work, run, repository, build });
    checkSha(artifact, repository.sourceSha, CODE_STEP.INSPECT_ARTIFACT);
    const ci = await call(CODE_STEP.CI_CHECKPOINT, { work, run, repository, tests, build, artifact });
    const gate = await call(CODE_STEP.GATE, { work, run, repository, tests, build, artifact, ci });
    const deployment = await call(CODE_STEP.DEPLOY, { work, run, repository, artifact, gate });
    checkSha(deployment, repository.sourceSha, CODE_STEP.DEPLOY);
    const runtime = await call(CODE_STEP.RUNTIME_VERIFY, { work, run, repository, deployment });
    const runtimeMatches = runtime.runtimeSha === repository.sourceSha;
    evidence.push({ kind: 'CODE_VERSION_GATE', verificationScope: 'VERSION', source: { systemId: 'CODE_MACHINE', surfaceId: CODE_STEP.VERSION_GATE }, contentRef: runtime.evidenceRef || `version://${repository.sourceSha}`, metadata: { sourceSha: repository.sourceSha, runtimeSha: runtime.runtimeSha, matches: runtimeMatches } });
    run = await kernel.beginVerification(run.runId, { actorRef });
    run = await kernel.verify(run.runId, { evidence, versionGate: { status: runtimeMatches ? 'PASS' : 'UNKNOWN', observed: { sourceSha: repository.sourceSha, runtimeSha: runtime.runtimeSha }, reason: runtimeMatches ? 'SOURCE_RUNTIME_MATCH' : 'SOURCE_RUNTIME_MISMATCH' }, actorRef });
    if (run.executionState === EXECUTION_STATE.COMPLETE) run = await kernel.returnRun(run.runId, { resultRefs: [artifact.artifactRef, deployment.deploymentRef], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'CODE_OWNER_READBACK_COMPLETE' });
    else if (run.executionState === EXECUTION_STATE.UNKNOWN) run = await kernel.returnRun(run.runId, { resultRefs: [], evidenceRefs: evidence.map((item) => item.contentRef), boundaryStatus: 'HANDOFF_VERIFIED', nextAction: 'CODE_RUNTIME_RECONCILIATION_REQUIRED' });
    return { run, steps, evidence, repository, artifact, deployment, runtime };
  } catch (error) {
    return settleFailure(error);
  }
}
