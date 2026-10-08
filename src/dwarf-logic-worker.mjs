import { assertDurableStore } from './durable-store.mjs';
import { createDurableMachinePersistence } from './durable-machine-persistence.mjs';
import { createMachineKernel } from './machine-kernel.mjs';
import { createAgentEvaluationAdapter } from './logic-adapters.mjs';
import { runLogicMachine } from './logic-machine.mjs';
import { importLegacyGoldenCases, LEGACY_GOLDEN_CASES } from './legacy-golden-cases.mjs';

export const DWARF_ID = 'DWARF-01';
export const DWARF_LINEAGE = Object.freeze({
  predecessor: 'PIXIE-01',
  relationship: 'UPGRADE_SUCCESSOR',
  factoryIdentity: DWARF_ID,
});

export const DWARF_LOGIC_EMPLOYMENT = Object.freeze({
  status: 'ACTIVE',
  role: 'LOGIC_WORKER',
  domain: 'LOGIC',
  bench: 'DEVELOPMENT_BENCH',
  executionAllowed: true,
  testsAllowed: true,
  mergeAllowed: false,
});

const clone = (value) => value == null ? value : structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label}_REQUIRED`);
  return text;
}

async function putOnce(store, key, value) {
  const current = await store.get(key);
  if (current) return current;
  await store.put(key, value, { expectedVersion: 0 });
  return store.get(key);
}

function evidenceRefFor(key) {
  return `r2://factory/records/${key}`;
}

function machineWork(work, observedAt) {
  const workId = required(work?.workId, 'work.workId');
  const checkpointId = required(work?.checkpointId, 'work.checkpointId');
  const workPassRef = required(work?.workPassRef || work?.workPass?.passId || 'WORK_PASS', 'work.workPassRef');
  return {
    runId: `DWARF-LOGIC:${workId}:${checkpointId}`,
    workId,
    machineId: 'DWARF-LOGIC-MACHINE',
    machineVersion: '1.0.0',
    domain: 'LOGIC',
    ingress: { systemId: 'METROPOLIS', surfaceType: 'STATION', surfaceId: 'METROPOLIS-STATION' },
    destination: { systemId: 'FACTORY', surfaceType: 'OWNER', surfaceId: 'LOGIC', ownerDomain: 'LOGIC' },
    transportRef: { kind: 'RAIL', linkId: 'METRO-FACTORY', trustBoundaryRef: 'FACTORY-STATION' },
    requestedBy: {
      actorId: String(work?.workPass?.actor || 'GO'),
      authorityRef: workPassRef,
      requestedAt: String(work?.requestedAt || observedAt),
    },
    subject: {
      subjectId: DWARF_ID,
      subjectType: 'FACTORY_AGENT',
      ownerSystem: 'FACTORY',
      lifecycleAuthorityRef: 'OWNER_APPROVED_ACTIVE_WORKER',
    },
    inputRefs: Array.isArray(work?.inputRefs) ? work.inputRefs : [],
    createdAt: observedAt,
  };
}

function createTrainingProvider({ store, work, clock }) {
  const base = `logic/workers/${DWARF_ID}/runs/${work.workId}/${work.checkpointId}`;

  async function stage(name, payload = {}) {
    const key = `${base}/${name.toLowerCase()}`;
    const record = {
      schema: 'DWARF_LOGIC_WORK_STAGE_V1',
      dwarfId: DWARF_ID,
      employment: DWARF_LOGIC_EMPLOYMENT,
      stage: name,
      workId: work.workId,
      checkpointId: work.checkpointId,
      payload: clone(payload),
      observedAt: clock(),
    };
    await putOnce(store, key, record);
    return { status: 'PASS', evidenceRef: evidenceRefFor(key) };
  }

  return Object.freeze({
    designBench: async () => stage('DESIGN_BENCH', { objective: 'LEARN_AND_VALIDATE_GOLDEN_CASES' }),
    buildBench: async () => stage('BUILD_BENCH', { goldenCaseCount: LEGACY_GOLDEN_CASES.length }),
    developmentBench: async () => stage('DEVELOPMENT_BENCH', { worker: DWARF_ID, employmentStatus: 'ACTIVE' }),
    simulate: async () => stage('SIMULATION', { mode: 'SAFE_TRAINING_REPLAY' }),

    async runGoldenCases() {
      const cases = [];
      for (const golden of LEGACY_GOLDEN_CASES) {
        const stored = await store.get(`logic/golden-cases/legacy/${golden.goldenCaseId}`);
        const legacyCase = stored?.value?.legacyCase;
        const issues = stored?.value?.migration?.issues || [];
        const learned = Boolean(legacyCase?.expected) && Boolean(legacyCase?.fixedObserved);
        cases.push({
          goldenCaseId: golden.goldenCaseId,
          learned,
          legacyParity: learned ? same(legacyCase.expected, legacyCase.fixedObserved) : false,
          currentReplayStatus: 'UNKNOWN',
          currentReplayReason: stored?.value?.migration?.executableAsCurrent === false
            ? 'REQUALIFICATION_REQUIRED'
            : 'CURRENT_EXECUTION_EVIDENCE_REQUIRED',
          issues,
        });
      }

      const key = `${base}/golden-cases`;
      const report = {
        schema: 'DWARF_GOLDEN_TRAINING_REPORT_V1',
        dwarfId: DWARF_ID,
        total: cases.length,
        learned: cases.filter((item) => item.learned).length,
        legacyParityPass: cases.filter((item) => item.legacyParity).length,
        currentReplay: {
          pass: 0,
          regression: 0,
          unknown: cases.length,
          qualification: 'REQUALIFICATION_REQUIRED',
        },
        cases,
        mergeAllowed: false,
        observedAt: clock(),
      };
      await putOnce(store, key, report);
      return {
        status: report.learned === LEGACY_GOLDEN_CASES.length ? 'PASS' : 'FAIL',
        goldenRef: evidenceRefFor(key),
        evidenceRef: evidenceRefFor(key),
        report,
      };
    },

    async evaluate(input) {
      const report = input?.golden?.report;
      return stage('EVALUATION', {
        status: report?.learned === LEGACY_GOLDEN_CASES.length ? 'PASS' : 'FAIL',
        learned: report?.learned || 0,
        total: report?.total || 0,
        currentQualification: 'REQUALIFICATION_REQUIRED',
      });
    },

    async rca(input) {
      return stage('RCA', { reason: input?.evaluation?.status || 'UNKNOWN' });
    },

    async qualifyAgent() {
      const result = await stage('QUALIFICATION', {
        employmentStatus: 'ACTIVE',
        executionAllowed: true,
        testsAllowed: true,
        mergeAllowed: false,
        currentLogicQualification: 'REQUALIFICATION_REQUIRED',
      });
      return { ...result, qualificationStatus: 'ACTIVE_WORKER', currentLogicQualification: 'REQUALIFICATION_REQUIRED' };
    },

    async version() {
      const key = `${base}/version`;
      const version = {
        schema: 'DWARF_LOGIC_WORKER_VERSION_V1',
        dwarfId: DWARF_ID,
        logicVersion: 'dwarf-logic-worker-v1',
        employmentStatus: 'ACTIVE',
        mergeAllowed: false,
        observedAt: clock(),
      };
      await putOnce(store, key, version);
      return { status: 'PASS', versionRef: evidenceRefFor(key), logicVersion: version.logicVersion };
    },
  });
}

export function createDwarfLogicWorker({
  store,
  clock = () => new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const durable = assertDurableStore(store);

  return async function runDwarfLogicWorker({ work, actorRef = 'PIXIE' } = {}) {
    const workId = required(work?.workId, 'work.workId');
    const checkpointId = required(work?.checkpointId, 'work.checkpointId');
    const ownerDomain = required(work?.ownerDomain, 'work.ownerDomain').toUpperCase();

    if (ownerDomain !== 'LOGIC') {
      return Object.freeze({
        authorityBoundary: true,
        retryable: false,
        worker: DWARF_LOGIC_EMPLOYMENT,
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

    if (String(work?.intent || '').toUpperCase() === 'IMPORT_GOLDEN_CASES') {
      const migration = await importLegacyGoldenCases({ store: durable, clock });
      return Object.freeze({
        worker: DWARF_LOGIC_EMPLOYMENT,
        migration,
        authority: Object.freeze({ execute: true, test: true, merge: false, authorityTransferred: false }),
        run: Object.freeze({
          workId,
          checkpointId,
          executionState: 'COMPLETE',
          returnState: 'RETURNED',
          verificationRef: migration.evidenceRef,
          returnRef: `${migration.evidenceRef}#return`,
          evidenceRefs: Object.freeze([migration.evidenceRef]),
          observedAt: clock(),
        }),
        retryable: false,
      });
    }

    await importLegacyGoldenCases({ store: durable, clock });

    const persistence = createDurableMachinePersistence({ store: durable, clock });
    const observedAt = clock();
    const input = machineWork(work, observedAt);
    const existing = await persistence.loadRun(input.runId);
    if (existing?.executionState === 'COMPLETE' && existing?.returnState === 'RETURNED') {
      const training = await durable.get(`logic/workers/${DWARF_ID}/runs/${workId}/${checkpointId}/golden-cases`);
      return Object.freeze({
        worker: DWARF_LOGIC_EMPLOYMENT,
        authority: Object.freeze({ execute: true, test: true, merge: false, authorityTransferred: false }),
        run: existing,
        training: training?.value || null,
        idempotent: true,
        retryable: false,
      });
    }

    const kernel = createMachineKernel({ persistence, clock, idFactory });
    const provider = createTrainingProvider({ store: durable, work: { ...work, workId, checkpointId }, clock });
    const adapter = createAgentEvaluationAdapter(provider);
    const result = await runLogicMachine({ kernel, adapter, work: input, actorRef });

    const training = await durable.get(`logic/workers/${DWARF_ID}/runs/${workId}/${checkpointId}/golden-cases`);
    return Object.freeze({
      ...result,
      worker: DWARF_LOGIC_EMPLOYMENT,
      authority: Object.freeze({ execute: true, test: true, merge: false, authorityTransferred: false }),
      training: training?.value || null,
      retryable: false,
    });
  };
}
