export const LOGIC_CONTRACT_VERSION = '0.1.0';

export const LOGIC_TARGET = Object.freeze({ EXPERIMENT: 'EXPERIMENT', AGENT_EVALUATION: 'AGENT_EVALUATION', SIMULATION: 'SIMULATION' });
export const LOGIC_STEP = Object.freeze({ DESIGN_BENCH: 'DESIGN_BENCH', BUILD_BENCH: 'BUILD_BENCH', DEVELOPMENT_BENCH: 'DEVELOPMENT_BENCH', SIMULATION: 'SIMULATION', GOLDEN_CASES: 'GOLDEN_CASES', EVALUATION: 'EVALUATION', RCA: 'RCA', QUALIFICATION: 'QUALIFICATION', VERSIONING: 'VERSIONING', RETURN: 'RETURN' });
export const LOGIC_STATUS = Object.freeze({ PASS: 'PASS', READY: 'READY', NEEDS_RCA: 'NEEDS_RCA', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' });
export const LOGIC_ADAPTER_METHODS = Object.freeze(['designBench', 'buildBench', 'developmentBench', 'simulate', 'runGoldenCases', 'evaluate', 'rca', 'qualifyAgent', 'version']);

export function assertLogicAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('logicAdapter_REQUIRED');
  if (!Object.values(LOGIC_TARGET).includes(adapter.target)) throw new TypeError('logicAdapter.target_INVALID');
  for (const method of LOGIC_ADAPTER_METHODS) if (typeof adapter[method] !== 'function') throw new TypeError(`logicAdapter.${method}_REQUIRED`);
  return adapter;
}
