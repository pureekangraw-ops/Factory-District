import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { createGoldenCase, replayGoldenCase, createRegressionAlert } from '../src/golden-case.mjs';
import { LEGACY_GOLDEN_CASES, importLegacyGoldenCases } from '../src/legacy-golden-cases.mjs';

const store = () => createDurableStore({ driver: createInMemoryDurableDriver() });
const now = () => '2026-10-08T00:00:00.000Z';

test('recovered legacy catalog contains all eight Golden Cases', () => {
  assert.equal(LEGACY_GOLDEN_CASES.length, 8);
  assert.deepEqual(LEGACY_GOLDEN_CASES.map((item) => item.goldenCaseId), [
    'GOLDEN-SPECTRUM-AMBIGUOUS-WORK-001',
    'GOLDEN-SPECTRUM-IDEMPOTENCY-001',
    'GOLDEN-SPECTRUM-SALES-PRISM-INDEPENDENCE-001',
    'GOLDEN-SPECTRUM-CUSTOMER-SAFETY-001',
    'GOLDEN-HUB-001-CLAIM-OWNERSHIP',
    'GOLDEN-HUB-005-NO-EXECUTABLE-LEGACY',
    'GOLDEN-HUB-008-PIXIE-DIRECT-DEBUG',
    'GOLDEN-HUB-010-UNKNOWN-FAILS-CLOSED',
  ]);
});

test('legacy import is durable, idempotent and never activates old truth as current', async () => {
  const durable = store();
  const first = await importLegacyGoldenCases({ store: durable, clock: now });
  assert.equal(first.status, 'IMPORTED_REFERENCE');
  assert.equal(first.count, 8);
  assert.equal(first.imported.length, 8);
  assert.equal(first.currentQualification, 'REQUALIFICATION_REQUIRED');
  assert.equal(first.executableAsCurrent, false);
  assert.equal(first.authorityTransferred, false);

  const second = await importLegacyGoldenCases({ store: durable, clock: now });
  assert.equal(second.imported.length, 0);
  assert.equal(second.existing.length, 8);
  assert.equal(second.evidenceRef, first.evidenceRef);

  const corrupt = await durable.get('logic/golden-cases/legacy/GOLDEN-SPECTRUM-AMBIGUOUS-WORK-001');
  assert.equal(corrupt.value.legacyCase.replayRecipe, '[object Object]');
  assert.ok(corrupt.value.migration.issues.includes('LEGACY_REPLAY_RECIPE_CORRUPTED'));
  assert.equal(corrupt.value.migration.currentQualification, 'REQUALIFICATION_REQUIRED');
});

test('Golden replay preserves old PASS/regression behavior', () => {
  const golden = createGoldenCase({
    goldenCaseId: 'G-1',
    sourceBugId: 'B-1',
    sourceRunId: 'R-1',
    inputRef: 'fixture://1',
    expected: { ok: true },
    fixedObserved: { ok: true },
    replayRecipe: 'replay://1',
    now,
  });
  const pass = replayGoldenCase(golden, { runId: 'R-2', logicVersion: '2', observed: { ok: true }, now });
  assert.equal(pass.status, 'GOLDEN_ACTIVE');
  const regression = replayGoldenCase(golden, { runId: 'R-3', logicVersion: '3', observed: { ok: false }, now });
  assert.equal(regression.status, 'REGRESSION_CASE');
  const alert = createRegressionAlert({
    alertId: 'A-1',
    goldenCaseId: golden.goldenCaseId,
    runId: 'R-3',
    logicVersion: '3',
    expected: golden.expected,
    observed: { ok: false },
    now,
  });
  assert.equal(alert.severity, 'CRITICAL');
  assert.equal(alert.status, 'OPEN');
});
