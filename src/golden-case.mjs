export const GOLDEN_STATUSES = Object.freeze([
  'GOLDEN_CANDIDATE',
  'VERIFY_REPLAY',
  'GOLDEN_ACTIVE',
  'REGRESSION_CASE',
  'RETIRED',
]);

const clone = (value) => value == null ? value : structuredClone(value);
const unique = (values = []) => [...new Set((Array.isArray(values) ? values : [values]).map((value) => String(value ?? '').trim()).filter(Boolean))];
const required = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label}_REQUIRED`);
  return text;
};
const freeze = (value) => Object.freeze(clone(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createGoldenCase({
  goldenCaseId,
  sourceBugId,
  sourceRunId,
  inputRef,
  expected,
  fixedObserved,
  replayRecipe,
  logicVersions = [],
  evidenceRefs = [],
  status = 'GOLDEN_CANDIDATE',
  now = () => new Date().toISOString(),
} = {}) {
  if (!GOLDEN_STATUSES.includes(status)) throw new Error(`Unknown golden status: ${status}`);
  return freeze({
    goldenCaseId: required(goldenCaseId, 'goldenCaseId'),
    lifecycle: ['GOLDEN_CANDIDATE'],
    sourceBugId: required(sourceBugId, 'sourceBugId'),
    sourceRunId: required(sourceRunId, 'sourceRunId'),
    inputRef: required(inputRef, 'inputRef'),
    expected: clone(expected ?? null),
    fixedObserved: clone(fixedObserved ?? null),
    replayRecipe: required(replayRecipe, 'replayRecipe'),
    logicVersions: unique(logicVersions),
    evidenceRefs: unique(evidenceRefs),
    status,
    replayCount: 0,
    lastReplay: null,
    createdAt: now(),
  });
}

export function replayGoldenCase(golden, {
  runId,
  logicVersion,
  observed,
  evidenceRefs = [],
  now = () => new Date().toISOString(),
} = {}) {
  if (!golden || typeof golden !== 'object') throw new TypeError('golden_REQUIRED');
  const passed = same(observed, golden.expected);
  const status = passed ? 'GOLDEN_ACTIVE' : 'REGRESSION_CASE';
  const lifecycle = [...(golden.lifecycle || ['GOLDEN_CANDIDATE']), 'VERIFY_REPLAY', status];
  return freeze({
    ...clone(golden),
    status,
    lifecycle,
    replayCount: Number(golden.replayCount || 0) + 1,
    lastReplay: {
      runId: required(runId, 'runId'),
      logicVersion: required(logicVersion, 'logicVersion'),
      observed: clone(observed),
      evidenceRefs: unique(evidenceRefs),
      status,
      at: now(),
    },
  });
}

export function createRegressionAlert({
  alertId,
  goldenCaseId,
  runId,
  logicVersion,
  expected,
  observed,
  evidenceRefs = [],
  now = () => new Date().toISOString(),
} = {}) {
  return freeze({
    alertId: required(alertId, 'alertId'),
    goldenCaseId: required(goldenCaseId, 'goldenCaseId'),
    runId: required(runId, 'runId'),
    logicVersion: required(logicVersion, 'logicVersion'),
    expected: clone(expected),
    observed: clone(observed),
    evidenceRefs: unique(evidenceRefs),
    severity: 'CRITICAL',
    status: 'OPEN',
    createdAt: now(),
  });
}
