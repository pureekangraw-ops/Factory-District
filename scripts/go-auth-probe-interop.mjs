// Offline only: pass the GO factory-direct.mjs module from a verified checkout.
// Uses synthetic keys and in-memory bindings; never contacts a deployed Worker.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createFactoryWorker} from '../src/worker.mjs';
import {createDurableStore} from '../src/durable-store.mjs';
import {createInMemoryDurableDriver} from '../test/support/in-memory-durable-driver.mjs';

if (!process.argv[2]) throw Error('Usage: node scripts/go-auth-probe-interop.mjs /path/to/GO/worker/factory-direct.mjs');
const {factoryDirectStatus,factoryDirectAuthProbe}=await import(pathToFileURL(resolve(process.argv[2])));
const sha='a'.repeat(40), key='fixture-opaque-key!0123456789+abcdefgh/ABCDEFGHIJK';
let writes=0, executions=0;
const driver=createInMemoryDurableDriver();
for(const method of ['put','append']) driver[method]=async()=>{writes++;throw Error('PROBE_MUST_NOT_WRITE');};
const app=createFactoryWorker({SOURCE_SHA:sha,GO_FACTORY_RAIL_SECRET:key,
  METROPOLIS_FACTORY_RAIL_SECRET:'legacy-test-only'}, {
  recordStore:createDurableStore({driver}),
  domainRunners:Object.fromEntries(['CODE','VISUAL','LOGIC'].map(domain=>[domain,
    async()=>{executions++;throw Error('PROBE_MUST_NOT_EXECUTE');}]))
});
const env={GO_FACTORY_RAIL_SECRET:key,FACTORY_DIRECT:{fetch:request=>app.fetch(request)}};
const healthy=await factoryDirectStatus(env);
assert.equal(healthy.commandReady,true);
assert.equal(healthy.authStatus,'AUTHENTICATED');
assert.equal(healthy.sourceSha,sha);
const mismatch=await factoryDirectStatus({...env,GO_FACTORY_RAIL_SECRET:'different-opaque-key!0123456789+abcdefgh/ABCDEFGHIJK'});
assert.equal(mismatch.commandReady,false);
assert.equal(mismatch.authStatus,'FACTORY_SIGNATURE_REJECTED');
const oldRuntime=await factoryDirectStatus({...env,FACTORY_DIRECT:{fetch:request=>
  new URL(request.url).pathname==='/health'?app.fetch(request):new Response('',{status:404})}});
assert.equal(oldRuntime.commandReady,false);
assert.equal(oldRuntime.authStatus,'FACTORY_AUTH_PROBE_NOT_DEPLOYED');
const probe=await factoryDirectAuthProbe(env);
assert.equal(probe.authenticated,true);
assert.equal(probe.executed,false);
assert.equal(probe.readOnly,true);
assert.equal(Object.hasOwn(probe,'proof'),false);
assert.equal(writes,0);
assert.equal(executions,0);
console.log(JSON.stringify({status:'PASS',cases:['matched-opaque-key','mismatch','old-runtime','sanitized-proof'],writes,executions}));
