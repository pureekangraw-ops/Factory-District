import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/write-source-identity.mjs');
test('Cloudflare build embeds the exact Git commit, not a deployment UUID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'factory-build-'));
  try {
    const target = join(dir, 'identity.mjs');
    const sha = 'a'.repeat(40);
    const result = spawnSync(process.execPath, [script, target], { env: { ...process.env, WORKERS_CI_COMMIT_SHA: sha }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(target, 'utf8'), `export const BUILD_SOURCE_SHA = '${sha}';\n`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Invalid CI identity fails the build rather than falling back to a plausible version', () => {
  const result = spawnSync(process.execPath, [script], { env: { ...process.env, WORKERS_CI_COMMIT_SHA: 'version-uuid' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE_SHA_INVALID/);
});
