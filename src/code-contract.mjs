export const CODE_CONTRACT_VERSION = '0.1.0';

export const CODE_TARGET = Object.freeze({ NODE_WEB: 'NODE_WEB', CLOUDFLARE_WORKER: 'CLOUDFLARE_WORKER' });

export const CODE_STEP = Object.freeze({
  INSPECT_REPOSITORY: 'INSPECT_REPOSITORY',
  PLAN_CHANGE: 'PLAN_CHANGE',
  EXECUTE_CHANGE: 'EXECUTE_CHANGE',
  RUN_TESTS: 'RUN_TESTS',
  BUILD: 'BUILD',
  INSPECT_ARTIFACT: 'INSPECT_ARTIFACT',
  CI_CHECKPOINT: 'CI_CHECKPOINT',
  DEPLOY: 'DEPLOY',
  RUNTIME_VERIFY: 'RUNTIME_VERIFY',
  RETURN: 'RETURN',
});

export const CODE_STATUS = Object.freeze({ PASS: 'PASS', READY: 'READY', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' });

export const CODE_ADAPTER_METHODS = Object.freeze([
  'inspectRepository',
  'planChange',
  'executeChange',
  'runTests',
  'build',
  'inspectArtifact',
  'ciCheckpoint',
  'deploy',
  'verifyRuntime',
]);

export function assertCodeAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('codeAdapter_REQUIRED');
  if (!Object.values(CODE_TARGET).includes(adapter.target)) throw new TypeError('codeAdapter.target_INVALID');
  for (const method of CODE_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`codeAdapter.${method}_REQUIRED`);
  }
  return adapter;
}
