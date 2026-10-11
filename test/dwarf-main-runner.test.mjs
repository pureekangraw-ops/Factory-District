import test from 'node:test';
import assert from 'node:assert/strict';
import { createDwarfOperator } from '../src/dwarf-autonomous.mjs';

for (const domain of ['CODE', 'VISUAL', 'LOGIC']) {
  test(`DWARF-01 is the main runner for ${domain}, preserving Work identity`, async () => {
    let invoked = 0;
    const operator = createDwarfOperator({
      domainRunners: {
        [domain]: async ({ work, actorRef }) => {
          invoked += 1;
          assert.equal(actorRef, 'DWARF-01');
          assert.equal(work.workId, `WORK-${domain}`);
          return {
            run: {
              workId: work.workId,
              workCheckpointId: work.checkpointId,
              executionState: 'COMPLETE',
              returnState: 'RETURNED',
              verificationRef: 'evidence://verify',
              returnRef: 'evidence://return',
              evidenceRefs: ['evidence://run'],
            },
          };
        },
      },
    });
    const result = await operator.run({
      work: { workId: `WORK-${domain}`, checkpointId: 'CP-01' },
      domain,
      machineId: `${domain}-MACHINE`,
    });
    assert.equal(result.status, 'RETURNED');
    assert.equal(result.lifecycleStatus, 'COMPLETE');
    assert.equal(result.attempts, 1);
    assert.equal(invoked, 1);
    assert.equal(result.result.run.workId, `WORK-${domain}`);
    assert.equal(result.result.run.workCheckpointId, 'CP-01');
  });
}

test('DWARF does not claim success if CODE/VISUAL machine is not registered', async () => {
  const operator = createDwarfOperator({ domainRunners: {} });
  for (const domain of ['CODE', 'VISUAL']) {
    const result = await operator.run({ work: { workId: 'WORK-NOT-READY', checkpointId: 'CP-01' }, domain });
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.failure.code, 'MACHINE_NOT_REGISTERED');
    assert.equal(result.attempts, 0);
  }
});

test('DWARF stops at authority boundaries without retrying', async () => {
  let invoked = 0;
  const operator = createDwarfOperator({
    maxAttempts: 3,
    domainRunners: {
      CODE: async () => {
        invoked += 1;
        return { authorityBoundary: true, run: { executionState: 'BLOCKED', returnState: 'PENDING' } };
      },
    },
  });
  const result = await operator.run({ work: { workId: 'WORK-DENIED', checkpointId: 'CP-01' }, domain: 'CODE' });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(invoked, 1);
});

test('DWARF rejects missing Work ID or Checkpoint before selecting machinery', async () => {
  let invoked = 0;
  const operator = createDwarfOperator({ domainRunners: { LOGIC: async () => { invoked += 1; } } });
  const result = await operator.run({ work: { workId: 'WORK-MISSING-CHECKPOINT' }, domain: 'LOGIC' });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.failure.code, 'DWARF_WORK_CONTEXT_INVALID');
  assert.equal(invoked, 0);
});

test('DWARF does not complete a result with a mismatched Work Checkpoint', async () => {
  let invoked = 0;
  const operator = createDwarfOperator({
    domainRunners: {
      LOGIC: async () => {
        invoked += 1;
        return {
          run: {
            workId: 'WORK-1',
            workCheckpointId: 'WORK-1:CP-WRONG',
            executionState: 'COMPLETE',
            returnState: 'RETURNED',
            verificationRef: 'verification://1',
            returnRef: 'return://1',
            evidenceRefs: ['evidence://1'],
          },
        };
      },
    },
  });
  const result = await operator.run({
    work: { workId: 'WORK-1', checkpointId: 'WORK-1:CP-01' },
    domain: 'LOGIC',
  });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.failure.code, 'DWARF_RESULT_CONTEXT_MISMATCH');
  assert.equal(invoked, 1);
});

test('DWARF requires retryable and safeToRetry before retrying, within the configured bound', async () => {
  let invoked = 0;
  const operator = createDwarfOperator({
    maxAttempts: 2,
    domainRunners: {
      LOGIC: async ({ work }) => {
        invoked += 1;
        return invoked === 1
          ? { retryable: true, safeToRetry: true, run: { workId: work.workId, workCheckpointId: work.checkpointId, executionState: 'UNKNOWN' } }
          : { run: { workId: work.workId, workCheckpointId: work.checkpointId, executionState: 'COMPLETE', returnState: 'RETURNED', verificationRef: 'verification://1', returnRef: 'return://1', evidenceRefs: ['evidence://1'] } };
      },
    },
  });
  const result = await operator.run({
    work: { workId: 'WORK-RETRY', checkpointId: 'WORK-RETRY:CP-01' },
    domain: 'LOGIC',
  });
  assert.equal(result.status, 'RETURNED');
  assert.equal(result.attempts, 2);
  assert.equal(invoked, 2);
  assert.ok(result.events.some(event => event.phase === 'RECOVER'));
});

test('DWARF refuses an unbounded retry configuration', () => {
  assert.throws(() => createDwarfOperator({ maxAttempts: Infinity }), /DWARF_MAX_ATTEMPTS_INVALID/);
  assert.throws(() => createDwarfOperator({ maxAttempts: 4 }), /DWARF_MAX_ATTEMPTS_INVALID/);
});
