import { assertDurableStore } from './durable-store.mjs';

export const LEGACY_GOLDEN_SOURCE = Object.freeze({
  sourceSystem: 'ERGASTERION_LEGACY',
  sourceRepository: 'pureekangraw-ops/Ergasterion-factory',
  sourceCommit: '333bb49ce031a5e2888f222b8aec1f7040f9b3db',
  sourceArchive: 'Ergasterion-factory-LEGACY-FULL.zip',
  recoveredOn: '2026-10-08',
  recordCount: 8,
});

const clone = (value) => value == null ? value : structuredClone(value);
const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const LEGACY_GOLDEN_CASES = deepFreeze([
  {
    "goldenCaseId": "GOLDEN-SPECTRUM-AMBIGUOUS-WORK-001",
    "lifecycle": [
      "GOLDEN_CANDIDATE",
      "VERIFY_REPLAY",
      "GOLDEN_ACTIVE"
    ],
    "sourceBugId": "BUG-SPECTRUM-FAIL-CLOSED-001",
    "sourceRunId": "RUN-SPECTRUM-FAIL-CLOSED-001",
    "inputRef": "fixture://spectrum/ambiguous-work",
    "expected": {
      "status": "ASK",
      "dispatchAllowed": false,
      "reason": "CURRENT_WORK_AMBIGUOUS"
    },
    "fixedObserved": {
      "status": "ASK",
      "dispatchAllowed": false,
      "reason": "CURRENT_WORK_AMBIGUOUS"
    },
    "replayRecipe": "[object Object]",
    "logicVersions": [
      "v0.2-lab"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_ACTIVE",
    "replayCount": 1,
    "lastReplay": {
      "runId": "RUN-SPECTRUM-REPLAY-001",
      "logicVersion": "v0.2-lab",
      "observed": {
        "status": "ASK",
        "dispatchAllowed": false,
        "reason": "CURRENT_WORK_AMBIGUOUS"
      },
      "evidenceRefs": [
        "fixture://spectrum/ambiguous-work"
      ],
      "status": "GOLDEN_ACTIVE",
      "at": "2026-10-03T03:25:55.041Z"
    },
    "createdAt": "2026-10-03T03:24:52.676Z"
  },
  {
    "goldenCaseId": "GOLDEN-SPECTRUM-IDEMPOTENCY-001",
    "lifecycle": [
      "GOLDEN_CANDIDATE",
      "VERIFY_REPLAY",
      "GOLDEN_ACTIVE"
    ],
    "sourceBugId": "BUG-SPECTRUM-DUPLICATE-DISPATCH-001",
    "sourceRunId": "RUN-SPECTRUM-RECOVERY-001",
    "inputRef": "fixture://spectrum/idempotency-retry",
    "expected": {
      "status": "NO_DUPLICATE_DISPATCH",
      "receiptChecked": true,
      "dispatchCount": 1
    },
    "fixedObserved": {
      "status": "NO_DUPLICATE_DISPATCH",
      "receiptChecked": true,
      "dispatchCount": 1
    },
    "replayRecipe": "retry same Work/Checkpoint/action with existing receipt",
    "logicVersions": [
      "v0.2-lab"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_ACTIVE",
    "replayCount": 1,
    "lastReplay": {
      "runId": "RUN-SPECTRUM-REPLAY-IDEMPOTENCY-001",
      "logicVersion": "v0.2-lab",
      "observed": {
        "status": "NO_DUPLICATE_DISPATCH",
        "receiptChecked": true,
        "dispatchCount": 1
      },
      "evidenceRefs": [
        "fixture://spectrum/idempotency-retry"
      ],
      "status": "GOLDEN_ACTIVE",
      "at": "2026-10-03T03:52:07.717Z"
    },
    "createdAt": "2026-10-03T03:51:24.052Z"
  },
  {
    "goldenCaseId": "GOLDEN-SPECTRUM-SALES-PRISM-INDEPENDENCE-001",
    "lifecycle": [
      "GOLDEN_CANDIDATE",
      "VERIFY_REPLAY",
      "GOLDEN_ACTIVE"
    ],
    "sourceBugId": "BUG-SPECTRUM-CUSTOMER-DEPENDENCY-001",
    "sourceRunId": "RUN-SPECTRUM-CONTRACT-ISOLATION-001",
    "inputRef": "fixture://spectrum/sales-prism-independence",
    "expected": {
      "salesRequestAccepted": true,
      "prismSessionRequired": false,
      "salesContextContainsPersonalContext": false,
      "status": "CUSTOMER_SAFE"
    },
    "fixedObserved": {
      "salesRequestAccepted": true,
      "prismSessionRequired": false,
      "salesContextContainsPersonalContext": false,
      "status": "CUSTOMER_SAFE"
    },
    "replayRecipe": "Run a customer request while PRISM SPECTRUM is unavailable; verify SPECTRUMSALE remains bounded and customer-safe.",
    "logicVersions": [
      "v0.2-lab"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_ACTIVE",
    "replayCount": 1,
    "lastReplay": {
      "runId": "RUN-SPECTRUM-REPLAY-ISOLATION-001",
      "logicVersion": "v0.2-lab",
      "observed": {
        "salesRequestAccepted": true,
        "prismSessionRequired": false,
        "salesContextContainsPersonalContext": false,
        "status": "CUSTOMER_SAFE"
      },
      "evidenceRefs": [
        "fixture://spectrum/sales-prism-independence"
      ],
      "status": "GOLDEN_ACTIVE",
      "at": "2026-10-03T04:35:19.161Z"
    },
    "createdAt": "2026-10-03T04:33:32.928Z"
  },
  {
    "goldenCaseId": "GOLDEN-SPECTRUM-CUSTOMER-SAFETY-001",
    "lifecycle": [
      "GOLDEN_CANDIDATE",
      "VERIFY_REPLAY",
      "GOLDEN_ACTIVE"
    ],
    "sourceBugId": "BUG-SPECTRUM-INTERNAL-LEAK-001",
    "sourceRunId": "RUN-SPECTRUM-CONTRACT-SAFETY-001",
    "inputRef": "fixture://spectrum/hub-failure-customer-safety",
    "expected": {
      "statusClass": "TEMPORARILY_UNAVAILABLE",
      "customerSafeMessage": true,
      "stackTraceExposed": false,
      "internalStateExposed": false,
      "personalContextExposed": false
    },
    "fixedObserved": {
      "statusClass": "TEMPORARILY_UNAVAILABLE",
      "customerSafeMessage": true,
      "stackTraceExposed": false,
      "internalStateExposed": false,
      "personalContextExposed": false
    },
    "replayRecipe": "Simulate GO HUB failure for a storefront request; verify only stable customer-safe status crosses the Sales Contract.",
    "logicVersions": [
      "v0.2-lab"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_ACTIVE",
    "replayCount": 1,
    "lastReplay": {
      "runId": "RUN-SPECTRUM-REPLAY-SAFETY-001",
      "logicVersion": "v0.2-lab",
      "observed": {
        "statusClass": "TEMPORARILY_UNAVAILABLE",
        "customerSafeMessage": true,
        "stackTraceExposed": false,
        "internalStateExposed": false,
        "personalContextExposed": false
      },
      "evidenceRefs": [
        "fixture://spectrum/hub-failure-customer-safety"
      ],
      "status": "GOLDEN_ACTIVE",
      "at": "2026-10-03T04:36:02.790Z"
    },
    "createdAt": "2026-10-03T04:34:21.296Z"
  },
  {
    "goldenCaseId": "GOLDEN-HUB-001-CLAIM-OWNERSHIP",
    "lifecycle": [
      "GOLDEN_CANDIDATE"
    ],
    "sourceBugId": "BUG-HUB-CLAIM-OWNER-NULL",
    "sourceRunId": "BASELINE-HUB-CLAIM-001",
    "inputRef": "go-hub://centre/v4_claim",
    "expected": {
      "workStatus": "ON PROCESS",
      "holder": "GO",
      "ownership": {
        "ownerId": "GO"
      },
      "invariant": "holder === ownership.ownerId"
    },
    "fixedObserved": {
      "workStatus": "ON PROCESS",
      "holder": "GO",
      "ownership": {
        "ownerId": "GO"
      },
      "invariant": "holder === ownership.ownerId"
    },
    "replayRecipe": "Create CURRENT V4 Work, claim as GO, inspect durable state; holder and ownership.ownerId must both equal GO.",
    "logicVersions": [
      "GO_HUB_SYSTEM/V4",
      "bc9d1a138773c7884b2eee2d7c40877b2cad52f9"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_CANDIDATE",
    "replayCount": 0,
    "lastReplay": null,
    "createdAt": "2026-10-03T19:25:34.114Z"
  },
  {
    "goldenCaseId": "GOLDEN-HUB-005-NO-EXECUTABLE-LEGACY",
    "lifecycle": [
      "GOLDEN_CANDIDATE"
    ],
    "sourceBugId": "BUG-HUB-LEGACY-EXECUTION-PATH",
    "sourceRunId": "BASELINE-HUB-LEGACY-001",
    "inputRef": "go-hub://current-runtime/routes",
    "expected": {
      "legacyAliasExec": false,
      "legacyFallbackExec": false,
      "historicalEvidenceMayRemain": true
    },
    "fixedObserved": {
      "legacyAliasExec": false,
      "legacyFallbackExec": false,
      "historicalEvidenceMayRemain": true
    },
    "replayRecipe": "Enumerate CURRENT executable routes. Historical/legacy records may be readable evidence but must not route, gate, mutate, or override CURRENT behavior.",
    "logicVersions": [
      "GO_HUB_SYSTEM/V4",
      "bc9d1a138773c7884b2eee2d7c40877b2cad52f9"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_CANDIDATE",
    "replayCount": 0,
    "lastReplay": null,
    "createdAt": "2026-10-03T19:25:49.470Z"
  },
  {
    "goldenCaseId": "GOLDEN-HUB-008-PIXIE-DIRECT-DEBUG",
    "lifecycle": [
      "GOLDEN_CANDIDATE"
    ],
    "sourceBugId": "BUG-HUB-PIXIE-WRONG-ENTRY",
    "sourceRunId": "BASELINE-HUB-PIXIE-001",
    "inputRef": "go-hub://pixie-lab/debug",
    "expected": {
      "entry": "PIXIE_LAB_DIRECT",
      "factoryTaskRequired": false,
      "maintenanceRequired": false,
      "readOnly": true
    },
    "fixedObserved": {
      "entry": "PIXIE_LAB_DIRECT",
      "factoryTaskRequired": false,
      "maintenanceRequired": false,
      "readOnly": true
    },
    "replayRecipe": "Start PIXIE debug from its Lab runtime against GO Hub. It must not create a Factory task and must not require Maintenance for read-only debugging.",
    "logicVersions": [
      "GO_HUB_SYSTEM/V4",
      "bc9d1a138773c7884b2eee2d7c40877b2cad52f9"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_CANDIDATE",
    "replayCount": 0,
    "lastReplay": null,
    "createdAt": "2026-10-03T19:26:04.187Z"
  },
  {
    "goldenCaseId": "GOLDEN-HUB-010-UNKNOWN-FAILS-CLOSED",
    "lifecycle": [
      "GOLDEN_CANDIDATE"
    ],
    "sourceBugId": "BUG-HUB-UNKNOWN-FALLBACK",
    "sourceRunId": "BASELINE-HUB-UNKNOWN-001",
    "inputRef": "go-hub://unknown-route",
    "expected": {
      "unknownBecomesLegacyFallback": false,
      "unknownExecutes": false,
      "result": "STOP_OR_REPORT_UNKNOWN"
    },
    "fixedObserved": {
      "unknownBecomesLegacyFallback": false,
      "unknownExecutes": false,
      "result": "STOP_OR_REPORT_UNKNOWN"
    },
    "replayRecipe": "Present an unresolved/unknown route or identity. System must stop or report UNKNOWN; it must never revive a legacy alias or fallback path.",
    "logicVersions": [
      "GO_HUB_SYSTEM/V4",
      "bc9d1a138773c7884b2eee2d7c40877b2cad52f9"
    ],
    "evidenceRefs": [],
    "status": "GOLDEN_CANDIDATE",
    "replayCount": 0,
    "lastReplay": null,
    "createdAt": "2026-10-03T19:26:17.456Z"
  }
]);

function issuesFor(golden) {
  const issues = [];
  if (golden?.replayRecipe === '[object Object]') issues.push('LEGACY_REPLAY_RECIPE_CORRUPTED');
  if (!Array.isArray(golden?.evidenceRefs) || golden.evidenceRefs.length === 0) issues.push('LEGACY_CASE_HAS_NO_EVIDENCE_REFS');
  return issues;
}

export async function importLegacyGoldenCases({
  store,
  clock = () => new Date().toISOString(),
} = {}) {
  const durable = assertDurableStore(store);
  const importedAt = clock();
  const imported = [];
  const existing = [];
  const issues = [];

  for (const golden of LEGACY_GOLDEN_CASES) {
    const key = `logic/golden-cases/legacy/${golden.goldenCaseId}`;
    const current = await durable.get(key);
    if (current) {
      existing.push(golden.goldenCaseId);
      continue;
    }
    const recordIssues = issuesFor(golden);
    const record = {
      schema: 'GOLDEN_CASE_IMPORT_V1',
      source: LEGACY_GOLDEN_SOURCE,
      legacyCase: clone(golden),
      migration: {
        status: 'IMPORTED_REFERENCE',
        currentQualification: 'REQUALIFICATION_REQUIRED',
        executableAsCurrent: false,
        issues: recordIssues,
      },
      authorityTransferred: false,
      importedAt,
    };
    await durable.put(key, record, { expectedVersion: 0 });
    imported.push(golden.goldenCaseId);
    for (const issue of recordIssues) issues.push({ goldenCaseId: golden.goldenCaseId, issue });
  }

  const catalogKey = 'logic/golden-cases/catalog/legacy-ergasterion-2026-10-08';
  let catalog = await durable.get(catalogKey);
  if (!catalog) {
    await durable.put(catalogKey, {
      schema: 'GOLDEN_CASE_CATALOG_V1',
      source: LEGACY_GOLDEN_SOURCE,
      goldenCaseIds: LEGACY_GOLDEN_CASES.map((item) => item.goldenCaseId),
      count: LEGACY_GOLDEN_CASES.length,
      migrationStatus: 'REFERENCE_ONLY_REQUALIFICATION_REQUIRED',
      authorityTransferred: false,
      importedAt,
    }, { expectedVersion: 0 });
    catalog = await durable.get(catalogKey);
  }

  const evidenceRef = `r2://factory/records/${catalogKey}`;
  await durable.append('logic/golden-cases/import-events', {
    kind: 'LEGACY_GOLDEN_CASE_IMPORT',
    sourceCommit: LEGACY_GOLDEN_SOURCE.sourceCommit,
    imported,
    existing,
    evidenceRef,
    observedAt: clock(),
  });

  return Object.freeze({
    status: 'IMPORTED_REFERENCE',
    count: LEGACY_GOLDEN_CASES.length,
    imported: Object.freeze(imported),
    existing: Object.freeze(existing),
    issues: Object.freeze(issues),
    currentQualification: 'REQUALIFICATION_REQUIRED',
    executableAsCurrent: false,
    authorityTransferred: false,
    catalogVersion: catalog?.version || null,
    evidenceRef,
  });
}
