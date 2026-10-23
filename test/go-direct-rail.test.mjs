import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryWorker} from '../src/worker.mjs';
import {createDurableStore} from '../src/durable-store.mjs';
import {createInMemoryDurableDriver} from './support/in-memory-durable-driver.mjs';
import {validateGoDirectHandoff} from '../src/go-direct-rail.mjs';

const secret='e'.repeat(64), SHA='a'.repeat(40), workId='WORK-GO-DIRECT-20261023', checkpointId='CP-01';
const localEnv={SOURCE_SHA:SHA, GO_FACTORY_RAIL_SECRET:secret,
  PANTHEON_FACTORY_RAIL_SECRET:'pantheon-legacy-secret-rail', METROPOLIS_FACTORY_RAIL_SECRET:'metro-legacy-secret-rail'};
const pass={kind:'WORK_PASS',version:'WORK_PASS_V1',status:'ACTIVE',
  passId:'GO-REAL-WORK-PASS-123',workId,checkpointId,actor:'GO',
  authorityTransferred:false,
  permissions:{actions:['read','handoff'],handoff:[{stationId:'FACTORY_STATION'}]}};
function body(domain='CODE') {
  return {workId,checkpointId,workPassRef:'work-pass://'+pass.passId,workPass:pass,
    source:{stationId:'GO-BRAIN',system:'go-together'},
    target:{stationId:'FACTORY-STATION',system:'factory-district',component:'FACTORY_HALL'},
    ownerDomain:domain,
    intent:domain==='CODE'?'EXECUTE_CODE':domain==='VISUAL'?'EXECUTE_VISUAL':'PLACE_DWARF_LOGIC_TRAINEE',
    scope:domain==='CODE'?['EXECUTE:CODE','DEPLOY:CODE']:[`EXECUTE:${domain}`],
    inputRefs:domain==='LOGIC'?[]:[`r2://factory/edge-inputs/${domain.toLowerCase()}.json#sha256=${'b'.repeat(64)}`],
    expectedSourceSha:SHA,requestedAt:new Date().toISOString()};
}
async function signed(path, {payload=body(),method='POST',key=secret,client='GO'}={}) {
  const raw=method==='GET'?'':JSON.stringify(payload);
  const timestamp=String(Date.now());
  const sk=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',sk,
    new TextEncoder().encode(timestamp+'.'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return new Request('https://factory.test'+path,{method,headers:{
    'x-factory-client':client,
    'x-metropolis-factory-protocol':'METROPOLIS_FACTORY_STATION_V2',
    'x-metropolis-factory-timestamp':timestamp,
    'x-metropolis-factory-signature':signature,
    ...(method==='GET'?{}:{'content-type':'application/json'})},
    ...(method==='GET'?{}:{body:raw})});
}
function create() {
  let count=0;
  const recordStore=createDurableStore({driver:createInMemoryDurableDriver()});
  const domainRunners=Object.fromEntries(['CODE','VISUAL','LOGIC'].map(domain=>[domain,
    async ({work})=>{count++;return {run:{workId:work.workId,checkpointId:work.checkpointId,
      executionState:'COMPLETE',returnState:'RETURNED',verificationRef:'evidence://go-direct',
      returnRef:'result://go-direct',evidenceRefs:['evidence://go-direct'],
      resultRefs:domain==='LOGIC'?[]:[`r2://factory/edge-results/${domain.toLowerCase()}/result.png`]}};}]));
  return {worker:createFactoryWorker(localEnv,{recordStore,domainRunners}),get count(){return count;}};
}
async function response(app,request) {const r=await app.fetch(request);return {http:r.status,json:await r.json()};}

test('GO direct signed CODE Work Pass preflight -> machine -> readback -> replay',async()=>{
  const f=create();
  const pre=await response(f.worker,await signed('/station/preflight'));
  assert.equal(pre.http,200,JSON.stringify(pre));
  assert.equal(pre.json.allowed,true);
  const result=await response(f.worker,await signed('/station/receive'));
  assert.equal(result.http,202,JSON.stringify(result));
  assert.equal(result.json.readback.domainVerified,true);
  assert.equal(result.json.readback.actingActor,'GO');
  assert.equal(f.count,1);
  const rid=result.json.receipt.receiptId;
  const read=await response(f.worker,await signed('/station/readback/'+rid,{method:'GET'}));
  assert.equal(read.http,200);
  assert.equal(read.json.receiptId,rid);
  assert.equal(read.json.sourceSha,SHA);
  assert.equal(read.json.domainVerified,true);
  const replay=await response(f.worker,await signed('/station/receive'));
  assert.equal(replay.http,202);
  assert.equal(replay.json.receipt.receiptId,rid);
  assert.equal(f.count,1);
});
test('GO direct VISUAL and LOGIC intents are separately accepted',async()=>{
  for(const domain of ['VISUAL','LOGIC']){
    const f=create();
    const pre=await response(f.worker,await signed('/station/preflight',{payload:body(domain)}));
    assert.equal(pre.http,200,JSON.stringify(pre));
    const result=await response(f.worker,await signed('/station/receive',{payload:body(domain)}));
    assert.equal(result.http,202,JSON.stringify(result));
    assert.equal(result.json.readback.domainVerified,true);
    assert.equal(f.count,1);
  }
});
test('incorrect/placeholder GO key rejects before Factory effects',async()=>{
  const f=create();
  for(const key of ['f'.repeat(64),'PENDING_REPLACE_GO_SIDE_20261023_INACTIVE']){
    const pre=await response(f.worker,await signed('/station/preflight',{key}));
    assert.notEqual(pre.http,200);
  }
  assert.equal(f.count,0);
  const inert=createFactoryWorker({...localEnv,GO_FACTORY_RAIL_SECRET:'PENDING_REPLACE_FACTORY_SIDE_20261023_INACTIVE'},{
    recordStore:createDurableStore({driver:createInMemoryDurableDriver()})});
  const denied=await response(inert,await signed('/station/receive'));
  assert.equal(denied.http,503);
  assert.equal(denied.json.reason,'GO_FACTORY_RAIL_KEY_NOT_CONFIGURED');
});
test('GO principal rejects forged source, PANTHEON identity, added scope and changed pass actor',async()=>{
  const f=create();
  for(const payload of [
    {...body(),source:{stationId:'PANTHEON',system:'pantheon-workhub'}},
    {...body(),workPass:{...pass,actor:'PANTHEON'}},
    {...body(),scope:['EXECUTE:CODE']},
    {...body(),scope:['EXECUTE:CODE','DEPLOY:CODE','EXTRA']},
    {...body(),intent:'EXECUTE_VISUAL'},
    {...body(),actingActor:'LIGHT'},
    {...body(),inputRefs:['https://not-immutable.example']},
    {...body(),workPassRef:'work-pass://invalid'},
  ]) {
    assert.throws(()=>validateGoDirectHandoff(payload),/GO_FACTORY_SCOPE_DENIED/);
    const denied=await response(f.worker,await signed('/station/receive',{payload}));
    assert.equal(denied.http,400,JSON.stringify(denied));
  }
  assert.equal(f.count,0);
});
test('GO direct readback denied for a City-produced receipt',async()=>{
  const f=create(),payload={...body(),source:{system:'METROPOLIS',stationId:'CITY'},
    workPass:{...pass},intent:'LIVE_E2E_BOUNDARY_HANDOFF'};
  const sent=await response(f.worker,await signed('/station/receive',{
    client:'CITY',key:localEnv.METROPOLIS_FACTORY_RAIL_SECRET,payload}));
  assert.equal(sent.http,202,JSON.stringify(sent));
  const denied=await response(f.worker,await signed('/station/readback/'+sent.json.receipt.receiptId,{method:'GET'}));
  assert.equal(denied.http,403);
  assert.equal(denied.json.reason,'GO_RAIL_READBACK_DENIED');
});

test('GO signed Factory receipt delivers exact bounded binary artifact bytes',async()=>{
  const source='export default {fetch(){return new Response("real factory artifact")}}';
  const bytes=new TextEncoder().encode(source);
  const artifactRef='r2://factory/edge-results/GO/CP-01/main.js';
  let fileReads=0;
  const bucket={get:async key=>{
    fileReads++;
    assert.equal(key,'edge-results/GO/CP-01/main.js');
    return {size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};
  }};
  const recordStore=createDurableStore({driver:createInMemoryDurableDriver()});
  const app=createFactoryWorker({...localEnv,RECORD_STORE:bucket},{recordStore,
    domainRunners:{CODE:async ({work})=>({run:{workId:work.workId,checkpointId:work.checkpointId,
      executionState:'COMPLETE',returnState:'RETURNED',
      verificationRef:'evidence://artifact',returnRef:'result://artifact',
      evidenceRefs:['evidence://artifact'],resultRefs:[artifactRef]}})}});
  const created=await response(app,await signed('/station/receive'));
  assert.equal(created.http,202);
  assert.equal(created.json.readback.domainVerified,true);
  const receiptId=created.json.receipt.receiptId;
  const received=await app.fetch(await signed('/station/go-artifact',{payload:{receiptId,artifactRef}}));
  assert.equal(received.status,200);
  assert.equal(await received.text(),source);
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  assert.equal(received.headers.get('x-factory-artifact-sha256'),actual);
  assert.equal(received.headers.get('x-factory-receipt-id'),receiptId);
  assert.equal(received.headers.get('x-factory-source-sha'),SHA);
  assert.equal(fileReads,1);
  const unrelated=await response(app,await signed('/station/go-artifact',{
    payload:{receiptId,artifactRef:'r2://factory/edge-results/GO/CP-01/secret.js'}}));
  assert.equal(unrelated.http,403);
  assert.equal(unrelated.json.reason,'ARTIFACT_NOT_IN_GO_RECEIPT');
  const fromCity=await response(app,await signed('/station/go-artifact',{
    payload:{receiptId,artifactRef},client:'CITY',key:localEnv.METROPOLIS_FACTORY_RAIL_SECRET}));
  assert.equal(fromCity.http,403);
  assert.equal(fromCity.json.reason,'GO_RAIL_REQUIRED');
  assert.equal(fileReads,1);
});
