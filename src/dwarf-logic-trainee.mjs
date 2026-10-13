import { assertDurableStore } from './durable-store.mjs';
import { importLegacyGoldenCases } from './legacy-golden-cases.mjs';

export const DWARF_ID = 'DWARF-01';
export const DWARF_LINEAGE = Object.freeze({
  predecessor: 'PIXIE-01',
  relationship: 'UPGRADE_SUCCESSOR',
  factoryIdentity: DWARF_ID,
});
export const DWARF_LOGIC_PLACEMENT = Object.freeze({
  domain: 'LOGIC',
  bench: 'DEVELOPMENT_BENCH',
  mode: 'TRAINING',
  productionAuthority: false,
});

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label}_REQUIRED`);
  return text;
}

function runResult({ workId, checkpointId, evidenceRef, returnRef, observedAt }) {
  return Object.freeze({
    run: Object.freeze({
      workId,
      checkpointId,
      executionState: 'COMPLETE',
      returnState: 'RETURNED',
      verificationRef: evidenceRef,
      returnRef,
      evidenceRefs: Object.freeze([evidenceRef]),
      observedAt,
    }),
  });
}

function unknownRunResult({ workId, checkpointId, code = 'LOGIC_WORKBENCH_RUNNER_NOT_WIRED' }) {
  return Object.freeze({
    retryable: false,
    run: Object.freeze({
      workId,
      checkpointId,
      executionState: 'UNKNOWN',
      returnState: 'PENDING',
      verificationRef: null,
      returnRef: null,
      evidenceRefs: Object.freeze([]),
    }),
    failure: Object.freeze({ code }),
  });
}

export function createDwarfLogicTraineeRunner({
  store,
  clock = () => new Date().toISOString(),
} = {}) {
  const durable = assertDurableStore(store);

  return async function runDwarfLogicTrainee({ work, actorRef = 'PIXIE', attempt = 1 } = {}) {
    const workId = required(work?.workId, 'work.workId');
    const checkpointId = required(work?.checkpointId, 'work.checkpointId');
    const ownerDomain = required(work?.ownerDomain, 'work.ownerDomain').toUpperCase();

    if (ownerDomain !== 'LOGIC') {
      return Object.freeze({
        authorityBoundary: true,
        retryable: false,
        run: Object.freeze({
          workId,
          checkpointId,
          executionState: 'BLOCKED',
          returnState: 'PENDING',
          verificationRef: null,
          returnRef: null,
          evidenceRefs: Object.freeze([]),
        }),
        failure: Object.freeze({ code: 'DWARF_LOGIC_DOMAIN_ONLY' }),
      });
    }

    const intent = String(work?.intent || '').trim().toUpperCase();
    if (intent === 'IMPORT_GOLDEN_CASES') {
      const migration = await importLegacyGoldenCases({ store: durable, clock });
      const observedAt = clock();
      return Object.freeze({
        ...runResult({
          workId,
          checkpointId,
          evidenceRef: migration.evidenceRef,
          returnRef: `${migration.evidenceRef}#return`,
          observedAt,
        }),
        migration,
        authority: Object.freeze({
          changeWork: false,
          merge: false,
          deploy: false,
          acceptCurrent: false,
          authorityTransferred: false,
        }),
        retryable: false,
      });
    }

    // Placement is not Logic Workbench execution. No training or generic Logic
    // request may claim completion until a real runner returns execution evidence.
    return unknownRunResult({ workId, checkpointId });
  };
}
