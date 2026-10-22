import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('primary Factory and private provider share production storage without automatic previews', async () => {
  const read = async name => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));
  const factory = await read('wrangler.jsonc'), provider = await read('wrangler.edge-provider.jsonc');
  assert.deepEqual(factory.r2_buckets, [{ binding: 'RECORD_STORE', bucket_name: 'factory' }]);
  assert.equal(factory.previews, undefined);
  assert.equal(factory.preview_urls, false);
  assert.equal(provider.workers_dev, false);
  assert.equal(provider.preview_urls, false);
  assert.equal(provider.vars.ARTIFACT_BUCKET, factory.r2_buckets[0].bucket_name);
  assert.equal(provider.r2_buckets[0].bucket_name, provider.vars.ARTIFACT_BUCKET);
  assert.equal(factory.services.length, 2);
  for (const domain of ['CODE', 'VISUAL']) {
    assert.equal(factory.services.find(s => s.binding === `${domain}_PROVIDER`).service, provider.name);
  }
});
