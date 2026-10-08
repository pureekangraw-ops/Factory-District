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
  });
}

test('DWARF does not claim success if CODE/VISUAL machine is not registered', async () => {
  const operator = createDwarfOperator({ domainRunners: {} });
  for (const domain of ['CODE', 'VISUAL']) {
    const result = await operator.run({ work: { workId: 'WORK-NOT-READY' }, domain });
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
  const result = await operator.run({ work: { workId: 'WORK-DENIED' }, domain: 'CODE' });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(invoked, 1);
});
