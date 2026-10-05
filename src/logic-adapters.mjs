import { assertLogicAdapter, LOGIC_ADAPTER_METHODS, LOGIC_TARGET } from './logic-contract.mjs';

function createAdapter(target, provider) {
  if (!provider || typeof provider !== 'object') throw new TypeError('provider_REQUIRED');
  for (const method of LOGIC_ADAPTER_METHODS) if (typeof provider[method] !== 'function') throw new TypeError(`provider.${method}_REQUIRED`);
  const adapter = { target };
  for (const method of LOGIC_ADAPTER_METHODS) adapter[method] = (input) => provider[method](input);
  return Object.freeze(assertLogicAdapter(adapter));
}

export function createExperimentAdapter(provider) { return createAdapter(LOGIC_TARGET.EXPERIMENT, provider); }
export function createAgentEvaluationAdapter(provider) { return createAdapter(LOGIC_TARGET.AGENT_EVALUATION, provider); }
export function createSimulationAdapter(provider) { return createAdapter(LOGIC_TARGET.SIMULATION, provider); }
