import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('branch previews use the existing nonproduction bucket without changing production binding', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.r2_buckets, [{ binding: 'RECORD_STORE', bucket_name: 'factory' }]);
  assert.deepEqual(config.previews?.r2_buckets, [{ binding: 'RECORD_STORE', bucket_name: 'factory-district-preview' }]);
  assert.ok(config.previews.r2_buckets.every(binding => binding.bucket_name !== 'factory'));
});
