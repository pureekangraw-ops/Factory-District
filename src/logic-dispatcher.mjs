import { createDwarfLogicTraineeRunner } from './dwarf-logic-trainee.mjs';

// DWARF placement is a legacy capability, not the default LOGIC executor.
// Keep its exact stored records and receipt semantics behind explicit intents.
export function createLogicDispatcher({ store, runner } = {}) {
  if (runner !== undefined && typeof runner !== 'function') throw new TypeError('logicRunner_INVALID');
  const dwarf = createDwarfLogicTraineeRunner({ store });
  const dispatchLogic = async function dispatchLogic(input = {}) {
    const work = input.work;
    if (work?.ownerDomain === 'LOGIC') {
      if (work.intent === 'PLACE_DWARF_LOGIC_TRAINEE'
        || String(work.intent || '').toUpperCase() === 'IMPORT_GOLDEN_CASES') return dwarf(input);
      if (runner) return runner(input);
    }
    return {
      retryable: false,
      failure: { code: work?.ownerDomain === 'LOGIC' ? 'LOGIC_RUNNER_NOT_CONFIGURED' : 'LOGIC_DOMAIN_ONLY' },
      run: { workId: work?.workId, checkpointId: work?.checkpointId,
        executionState: 'UNKNOWN', returnState: 'UNKNOWN',
        verificationRef: null, returnRef: null, evidenceRefs: [] },
    };
  };
  // Aggregate READY is retained for existing GO placement consumers. Describe
  // its scope explicitly: legacy capability registration is not runner readiness.
  dispatchLogic.readiness = Object.freeze({
    status: 'READY',
    reason: runner ? null : 'LOGIC_LEGACY_CAPABILITIES_ONLY',
    genericRunner: Object.freeze({ status: runner ? 'READY' : 'UNKNOWN',
      reason: runner ? null : 'LOGIC_RUNNER_NOT_CONFIGURED' }),
    capabilities: Object.freeze({
      PLACE_DWARF_LOGIC_TRAINEE: Object.freeze({ status: 'READY', reason: null }),
      IMPORT_GOLDEN_CASES: Object.freeze({ status: 'READY', reason: null }),
    }),
  });
  return Object.freeze(dispatchLogic);
}
