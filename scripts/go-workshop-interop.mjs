// Offline only. Actual GO client + Factory signed route + bounded provider;
// synthetic keys/storage, no deployed services or external model invocation.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { directWorkshopFixture, exerciseWorkshop } from '../test/support/workshop-direct-fixture.mjs';
import worker from '../src/worker.mjs';
if(!process.argv[2])throw Error('Usage: node scripts/go-workshop-interop.mjs /path/to/GO/worker/factory-direct.mjs');
const go=await import(pathToFileURL(resolve(process.argv[2])));
for(const kind of ['AGENT','RUNNER']) {
  const f=directWorkshopFixture();
  const env={GO_FACTORY_RAIL_SECRET:f.env.GO_FACTORY_RAIL_SECRET,FACTORY_DIRECT:{fetch:request=>worker.fetch(request,f.env)}};
  const status=await go.factoryDirectStatus(env);assert.equal(status.workshopReady,true);
  const denied=await go.factoryWorkshopContent(env,{content:{synthetic:true}},false);assert.equal(denied.status,'OWNER_APPROVAL_REQUIRED');
  const client={
    async put(content){const r=await go.factoryWorkshopContent(env,{content},true);assert.equal(r.ok,true,JSON.stringify(r));return r;},
    submit:(command,requestId)=>go.factoryDirectSubmit(env,{domain:'LOGIC',spec:{workshop:command},requestId},true),
    async delivery(receiptId,artifactRef){const r=await go.factoryDirectArtifact(env,{receiptId,artifactRef});assert.equal(r.ok,true,JSON.stringify(r));return JSON.parse(Buffer.from(r.base64,'base64').toString());},
  };
  const result=await exerciseWorkshop(client,kind);
  const read=await go.factoryDirectReadback(env,{receiptId:result.exported.receiptId});assert.equal(read.verified,true);
  const reconciled=await go.factoryDirectJobStatus(env,{requestId:result.exported.requestId});assert.equal(reconciled.receiptId,result.exported.receiptId);
  console.log(JSON.stringify({context:'LOCAL_SYNTHETIC_ONLY',kind,status:'PASS',operations:result.receiptIds.length,receiptId:result.exported.receiptId,packageSha256:result.delivery.sha256}));
}
