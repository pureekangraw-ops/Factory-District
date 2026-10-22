import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryWorker } from '../src/worker.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { authenticateRailRequest } from '../src/rail-auth.mjs';

const PANTHEON_SECRET = 'pantheon-test-rail-secret-20261014-'.repeat(2);
const METRO_SECRET = 'metro-test-rail-secret-20261014-'.repeat(2);
const workId = 'task_' + 'a'.repeat(32);
const checkpointId = 'cp-' + workId;
function envelope() {
  return {
    workId, checkpointId, ownerDomain:'LOGIC', intent:'PLACE_DWARF_LOGIC_TRAINEE',
    scope:['EXECUTE:LOGIC'], inputRefs:[],
    source:{stationId:'PANTHEON',system:'pantheon-workhub'},
    target:{stationId:'FACTORY-STATION',system:'factory-district',component:'FACTORY_HALL'},
    workPassRef:'work-pass://pantheon-'+workId,
    workPass:{kind:'WORK_PASS',version:'WORK_PASS_V1',status:'ACTIVE',passId:'pantheon-'+workId,
      workId,checkpointId,actor:'PANTHEON',permissions:{actions:['handoff'],handoff:[{stationId:'FACTORY_STATION'}]}}
  };
}
async function signed(path, {method='POST', body=envelope(), secret=PANTHEON_SECRET, client='PANTHEON'}={}) {
  const raw=method==='GET'?'':JSON.stringify(body),timestamp=String(Date.now());
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return new Request('https://factory.example'+path,{method,headers:{
    'x-metropolis-factory-protocol':'METROPOLIS_FACTORY_STATION_V2',
    'x-metropolis-factory-timestamp':timestamp,'x-metropolis-factory-signature':signature,
    ...(client?{'x-factory-client':client}:{})
  },body:method==='GET'?undefined:raw});
}
function worker(){
  let runs=0;
  const recordStore=createDurableStore({driver:createInMemoryDurableDriver()});
  const env={SOURCE_SHA:'testsha',PANTHEON_FACTORY_RAIL_SECRET:PANTHEON_SECRET,METROPOLIS_FACTORY_RAIL_SECRET:METRO_SECRET};
  const app=createFactoryWorker(env,{recordStore,domainRunners:{
    LOGIC:async ({work})=>{
      runs++;
      return {run:{workId:work.workId,checkpointId:work.checkpointId,executionState:'COMPLETE',
        returnState:'RETURNED',verificationRef:'evidence://test',returnRef:'result://test',
        evidenceRefs:['evidence://test'],resultRefs:['result://test']}};
    }
  }});
  return {app,env,get runs(){return runs;}};
}
async function response(app,req){const r=await app.fetch(req);return {status:r.status,data:await r.json()};}
test('PANTHEON isolated HMAC preflight, dispatch and verified readback',async()=>{
 const f=worker();
 const p=await response(f.app,await signed('/station/preflight'));
 assert.equal(p.status,200,JSON.stringify(p));
 const a=await response(f.app,await signed('/station/receive'));
 assert.equal(a.status,202,JSON.stringify(a));
 assert.equal(a.data.readback.domainVerified,true);
 assert.equal(f.runs,1);
 const again=await response(f.app,await signed('/station/receive'));
 assert.equal(again.data.receipt.receiptId,a.data.receipt.receiptId);
 assert.equal(f.runs,1);
 const back=await response(f.app,await signed('/station/readback/'+a.data.receipt.receiptId,{method:'GET'}));
 assert.equal(back.status,200);assert.equal(back.data.domainVerified,true);
});
test('PANTHEON cannot submit arbitrary work, spoof City principal or use Metro secret',async()=>{
 const f=worker();
 for(const body of [
   {...envelope(),ownerDomain:'CODE'},
   {...envelope(),intent:'IMPORT_GOLDEN_CASES'},
   {...envelope(),actingActor:'GO'},
   {...envelope(),cityAuthorization:{issuedBy:'CITY_HALL'}},
   {...envelope(),source:{stationId:'METROPOLIS',system:'METROPOLIS'}},
   {...envelope(),scope:['EXECUTE:LOGIC','EXECUTE:CODE']},
   {...envelope(),workPass:{...envelope().workPass,actor:'GO'}}
 ]){
   assert.equal((await response(f.app,await signed('/station/receive',{body}))).status,400);
 }
 assert.equal(f.runs,0);
 const wrong=await response(f.app,await signed('/station/preflight',{secret:METRO_SECRET}));
 assert.equal(wrong.status,401);
 const rail=await authenticateRailRequest(await signed('/station/preflight',{secret:METRO_SECRET,client:null}),f.env);
 assert.equal(rail.ok,true);assert.equal(rail.principal,'CITY');
});
test('PANTHEON readback may not inspect City receipts',async()=>{
 const f=worker();
 const cityPass={...envelope(),workId:'other-city-work',checkpointId:'cp-city',
  workPassRef:'work-pass://city',source:{stationId:'CITY',system:'METROPOLIS'},
  workPass:{...envelope().workPass,passId:'city',actor:'GO',workId:'other-city-work',checkpointId:'cp-city'}};
 const created=await response(f.app,await signed('/station/receive',{body:cityPass,secret:METRO_SECRET,client:null}));
 assert.equal(created.status,202);
 const denied=await response(f.app,await signed('/station/readback/'+created.data.receipt.receiptId,{method:'GET'}));
 assert.equal(denied.status,403);
});
test('reserved exact L1 identity cannot execute legacy trainee through either rail principal',async()=>{
 const f=worker(),id='task_d6c9e93a42fd4f339bb47d941428dd08',cp='cp-'+id;
 const base=envelope(),body={...base,workId:id,checkpointId:cp,workPassRef:'work-pass://pantheon-'+id,workPass:{...base.workPass,passId:'pantheon-'+id,workId:id,checkpointId:cp}};
 for(const auth of [{secret:PANTHEON_SECRET,client:'PANTHEON'},{secret:METRO_SECRET,client:'CITY'}]){
  for(const path of ['/station/preflight','/station/receive']){
   const r=await response(f.app,await signed(path,{body,...auth}));assert.notEqual(r.status,202);assert.equal(r.data.reason,'L1_TASK_RESERVED');
  }
 }
 assert.equal(f.runs,0);
});
