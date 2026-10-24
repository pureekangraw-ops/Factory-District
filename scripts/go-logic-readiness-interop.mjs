// Offline only: exercise the real GO consumer against Factory with synthetic
// credentials and an in-memory bucket. Never contacts a deployed Worker.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import worker from '../src/worker.mjs';
import { createLocalR2Bucket } from '../test/support/local-r2-bucket.mjs';

if (!process.argv[2]) throw Error('Usage: node scripts/go-logic-readiness-interop.mjs /path/to/GO/worker/factory-direct.mjs');
const { factoryDirectStatus, factoryDirectSubmit } = await import(pathToFileURL(resolve(process.argv[2])));
const secret = 'fixture-opaque-key!0123456789+abcdefgh/ABCDEFGHIJK';
const env = { RECORD_STORE: createLocalR2Bucket(), SOURCE_SHA: 'a'.repeat(40),
  GO_FACTORY_RAIL_SECRET: secret, METROPOLIS_FACTORY_RAIL_SECRET: 'fixture-legacy-only' };
const go = { GO_FACTORY_RAIL_SECRET: secret, FACTORY_DIRECT: { fetch: request => worker.fetch(request, env) } };
const health = await (await worker.fetch(new Request('https://local.invalid/health'), env)).json();
assert.equal(health.machinery.LOGIC.reason, 'LOGIC_LEGACY_CAPABILITIES_ONLY');
assert.equal(health.machinery.LOGIC.genericRunner.status, 'UNKNOWN');
const status = await factoryDirectStatus(go);
assert.equal(status.commandReady, true);
assert.equal(status.machinery.LOGIC, 'READY');
assert.equal(env.RECORD_STORE.records.size, 0);
const result = await factoryDirectSubmit(go, { domain: 'LOGIC',
  requestId: '11111111-1111-4111-8111-111111111111', spec: { placement: 'DWARF-01_TRAINING' } }, true);
assert.equal(result.ok, true, JSON.stringify(result));
assert.equal(result.status, 'LOGIC_TRAINING_PLACED');
assert.equal(result.deliveredBytes, false);
assert.ok(result.receiptId);
console.log(JSON.stringify({ status: 'PASS', context: 'LOCAL_SYNTHETIC_ONLY',
  genericRunner: 'UNKNOWN', legacyPlacement: result.status, receiptVerified: true }));
