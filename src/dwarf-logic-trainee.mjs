import { assertDurableStore } from './durable-store.mjs';

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

function runResult({ workId, evidenceRef, returnRef, observedAt }) {
  return Object.freeze({
    run: Object.freeze({
      workId,
      checkpointId: 'CP-05',
      executionState: 'COMPLETE',
      returnState: 'RETURNED',
      verificationRef: evidenceRef,
      returnRef,
      evidenceRefs: Object.freeze([evidenceRef]),
      observedAt,
    }),
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

    const key = `logic/trainees/${DWARF_ID}/${workId}/${checkpointId}`;
    const evidenceRef = `r2://factory/records/${key}`;
    const returnRef = `${evidenceRef}#return`;
    const existing = await durable.get(key);
    const observedAt = clock();

    if (!existing) {
      const placement = Object.freeze({
        schema: 'DWARF_LOGIC_TRAINEE_V1',
        dwarfId: DWARF_ID,
        lineage: DWARF_LINEAGE,
        workId,
        checkpointId,
        actorRef,
        attempt,
        placement: DWARF_LOGIC_PLACEMENT,
        qualificationStatus: 'PENDING_OWNER',
        authority: Object.freeze({
          changeWork: false,
          merge: false,
          deploy: false,
          acceptCurrent: false,
          authorityTransferred: false,
        }),
        status: 'PLACED_FOR_TRAINING',
        inputRefs: Object.freeze(Array.isArray(work?.inputRefs) ? [...work.inputRefs] : []),
        observedAt,
      });
      await durable.put(key, placement, { expectedVersion: 0 });
      await durable.append(`logic/trainee-events/${DWARF_ID}`, {
        kind: 'DWARF_LOGIC_TRAINEE_PLACED',
        workId,
        checkpointId,
        evidenceRef,
        observedAt,
      });
    }

    const persisted = await durable.get(key);
    const placement = persisted?.value;
    const verified = placement?.dwarfId === DWARF_ID
      && placement?.workId === workId
      && placement?.checkpointId === checkpointId
      && placement?.placement?.domain === 'LOGIC'
      && placement?.placement?.bench === 'DEVELOPMENT_BENCH'
      && placement?.placement?.productionAuthority === false;

    if (!verified) {
      return Object.freeze({
        retryable: false,
        run: Object.freeze({
          workId,
          checkpointId,
          executionState: 'UNKNOWN',
          returnState: 'UNKNOWN',
          verificationRef: null,
          returnRef: null,
          evidenceRefs: Object.freeze([]),
        }),
        failure: Object.freeze({ code: 'DWARF_LOGIC_PLACEMENT_READBACK_UNVERIFIED' }),
      });
    }

    return Object.freeze({
      ...runResult({ workId, evidenceRef, returnRef, observedAt: clock() }),
      trainee: placement,
      storageVersion: persisted.version,
      retryable: false,
    });
  };
}
