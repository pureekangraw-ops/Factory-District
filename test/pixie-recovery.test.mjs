import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixieOperator } from '../src/pixie-autonomous.mjs';
import { createPixie } from '../src/pixie.mjs';

const input = (workId = 'W') => ({ work: { workId, nested: { items: ['original'] } }, domain: 'CODE', machineId: 'CODE-MACHINE', authorityRef: 'AUTH' });
const complete = (identity = {}) => ({ run: { executionState: 'COMPLETE', returnState: 'RETURNED', ...identity } });
const operator = (runner, options = {}) => createPixieOperator({ ...options, domainRunners: { CODE: runner } });

test('recovery rejects all invalid budgets', () => {
  for (const maxAttempts of [0, -1, 1.5, NaN, Infinity, -Infinity, '2', 11, null, true, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => operator(() => complete(), { maxAttempts }), /maxAttempts_MUST_BE_INTEGER_1_TO_10/);
  }
});

test('valid 1, 10 and default budgets bound result and exception retries exactly', async () => {
  for (const options of [{ maxAttempts: 1 }, { maxAttempts: 10 }, {}]) {
    for (const throws of [false, true]) {
      let calls = 0;
      const result = await operator(async ({ attempt }) => {
        assert.equal(attempt, ++calls);
        if (throws) throw { retryable: true, message: 'private-data' };
        return { retryable: true };
      }, options).run(input());
      assert.equal(calls, options.maxAttempts ?? 1);
      assert.equal(result.attempts, calls);
      assert.equal(result.status, 'UNKNOWN');
      assert.equal(result.failure.class, 'VERIFICATION_FAILED');
      assert.equal(result.events.filter(e => e.phase === 'RECOVER').length, calls - 1);
    }
  }
});

test('all thrown authority markers stop after one call despite retryable', async () => {
  for (const marker of [{ code: 'AUTHORITY_DENIED' }, { authorityBoundary: true }, { class: 'AUTHORITY_DENIED' }]) {
    let calls = 0;
    const result = await operator(async () => { calls++; throw { ...marker, retryable: true, message: 'private-data' }; }, { maxAttempts: 10 }).run(input());
    assert.equal(calls, 1);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.failure.class, 'AUTHORITY_DENIED');
    assert.deepEqual(result.result, { error: { code: 'AUTHORITY_DENIED' } });
    assert.equal(result.events.some(e => e.phase === 'RECOVER'), false);
  }
});

test('null undefined primitives Error and custom-code throws are sanitized', async () => {
  for (const error of [null, undefined, 'private-data', 42, false, Symbol('private-data'), new Error('private-data'), { code: 'private-data', message: 'private-data' }]) {
    const result = await operator(async () => { throw error; }).run(input());
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.failure.class, 'VERIFICATION_FAILED');
    assert.deepEqual(result.result, { error: { code: 'PIXIE_MACHINE_ERROR' } });
    assert.equal(JSON.stringify(result).includes('private-data'), false);
  }
});

test('nested mutation is isolated across attempts and caller remains unchanged', async () => {
  for (const throws of [false, true]) {
    const request = input();
    const before = structuredClone(request);
    const seen = [];
    const result = await operator(async ({ work }) => {
      seen.push(structuredClone(work));
      work.workId = 'poison';
      work.nested.items.push('poison');
      if (throws) throw { retryable: true };
      return { retryable: true };
    }, { maxAttempts: 3 }).run(request);
    assert.equal(result.attempts, 3);
    assert.deepEqual(seen, Array(3).fill(before.work));
    assert.deepEqual(request, before);
  }
});

test('conflicting supplied identity fails closed without retry or verify', async () => {
  for (const identity of [{ workId: 'other' }, { machineId: 'other' }, { domain: 'VISUAL' }]) {
    let calls = 0;
    const result = await operator(async () => { calls++; return { ...complete(identity), retryable: true }; }, { maxAttempts: 10 }).run(input());
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.failure.code, 'MACHINE_IDENTITY_MISMATCH');
    assert.equal(calls, 1);
    assert.equal(result.events.some(e => e.phase === 'VERIFY' || e.phase === 'RECOVER'), false);
  }
});

test('matching identity and legacy omitted identity remain compatible', async () => {
  for (const identity of [{}, { workId: 'W', machineId: 'CODE-MACHINE', domain: 'CODE' }]) {
    const result = await operator(async () => complete(identity)).run({ ...input(), domain: 'code' });
    assert.equal(result.status, 'RETURNED');
    assert.equal(result.lifecycleStatus, 'COMPLETE');
  }
});

test('pending return remains UNKNOWN even with complete execution', async () => {
  const result = await operator(async () => complete({ returnState: 'PENDING' })).run(input());
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.failure.class, 'VERIFICATION_FAILED');
});

test('failed Work A cannot contaminate independent successful Work B', async () => {
  const a = input('A');
  const b = input('B');
  const before = structuredClone([a, b]);
  const pixie = operator(async ({ work }) => {
    if (work.workId === 'A') { work.nested.items.push('poison'); throw null; }
    assert.deepEqual(work, before[1].work);
    return complete({ workId: 'B' });
  });
  const [ra, rb] = await Promise.all([pixie.run(a), pixie.run(b)]);
  assert.equal(ra.status, 'UNKNOWN');
  assert.equal(rb.status, 'RETURNED');
  assert.deepEqual([a, b], before);
});

test('uncloneable Work produces stable failure with zero calls then separate Work succeeds', async () => {
  let calls = 0;
  const pixie = operator(async () => { calls++; return complete(); }, { maxAttempts: 10 });
  for (const value of [() => {}, Symbol('private-data')]) {
    const request = input(); request.work.nested.value = value;
    const result = await pixie.run(request);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.attempts, 0);
    assert.equal(result.failure.code, 'PIXIE_WORK_UNCLONEABLE');
    assert.equal(result.failure.class, 'VERIFICATION_FAILED');
    assert.equal(result.events.some(e => e.phase === 'EXECUTE' || e.phase === 'RECOVER'), false);
    assert.equal(request.work.nested.value, value);
    assert.equal(calls, 0);
  }
  assert.equal((await pixie.run(input('B'))).status, 'RETURNED');
  assert.equal(calls, 1);
});

test('direct PIXIE sanitizes thrown values then succeeds for separate Work', async () => {
  const handoff = workId => ({ workId, checkpointId: 'CP', workPassRef: 'work-pass://local', ownerDomain: 'CODE', scope: ['EXECUTE:CODE'] });
  for (const error of [null, undefined, 'private-data', new Error('private-data'), { code: 'private-data' }]) {
    const pixie = createPixie({ idFactory: () => 'local', handlers: { CODE: async ({ handoff: work }) => {
      if (work.workId === 'A') throw error;
      return { status: 'RETURNED', completed: true };
    } } });
    assert.deepEqual(await pixie.execute(handoff('A')), { status: 'UNKNOWN', reason: 'DESTINATION_ERROR', error: 'PIXIE_MACHINE_ERROR', workPassRef: 'work-pass://local' });
    const success = await pixie.execute(handoff('B'));
    assert.equal(success.status, 'HANDOFF_VERIFIED');
    assert.equal(success.domainCompleted, true);
  }
});
