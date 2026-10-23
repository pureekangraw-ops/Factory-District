import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryWorker} from '../src/worker.mjs';
import {createDurableStore} from '../src/durable-store.mjs';
import {createInMemoryDurableDriver} from './support/in-memory-durable-driver.mjs';
import {factoryJobId} from '../src/go-direct-rail.mjs';

const KEY='e'.repeat(64),SHA='a'.repeat(40);
const REQ='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const spec={baseSource:'export default "before"',patch:{find:'before',replace:'after'},
  tests:[{path:'/',status:200,body:'after'}]};
function r2(){
  const values=new Map();
  return {values,async get(key){const b=values.get(key);if(!b)return null;
    return {size:b.length,text:async()=>new TextDecoder().decode(b),
      arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};},
    async put(key,v){const b=typeof v==='string'?new TextEncoder().encode(v):new Uint8Array(v);
      values.set(key,new Uint8Array(b));}};
}
async function signed(path,{payload,client='GO',key=KEY,method='POST'}={}){
  const raw=method==='GET'?'':JSON.stringify(payload),timestamp=String(Date.now());
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',hmac,
    new TextEncoder().encode(timestamp+'.'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return new Request('https://factory.test'+path,{method,headers:{
    'x-factory-client':client,'x-metropolis-factory-protocol':'METROPOLIS_FACTORY_STATION_V2',
    'x-metropolis-factory-timestamp':timestamp,'x-metropolis-factory-signature':sig},
    ...(method==='GET'?{}:{body:raw})});
}
function fixture(secret=KEY){
  const bucket=r2(),store=createDurableStore({driver:createInMemoryDurableDriver()});
  let effects=0;
  const domainRunners=Object.fromEntries(['CODE','VISUAL','LOGIC'].map(domain=>[domain,async({work})=>{
    effects++;
    const ext=domain==='CODE'?'main.js':'render.png';
    const ref='r2://factory/edge-results/'+work.workId+'/'+work.checkpointId+'/run-1/'+ext;
    const refs=domain==='LOGIC'?[]:[ref];
    if(refs.length)await bucket.put(ref.slice('r2://factory/'.length),
      domain==='CODE'?'export default "after"':new Uint8Array([137,80,78,71,13,10,26,10]));
    return {run:{workId:work.workId,checkpointId:work.checkpointId,
      executionState:'COMPLETE',returnState:'RETURNED',
      verificationRef:'evidence://go',returnRef:'result://go',
      evidenceRefs:['evidence://go'],resultRefs:refs}};
  }]));
  const env={SOURCE_SHA:SHA,GO_FACTORY_RAIL_SECRET:secret,RECORD_STORE:bucket,
    PANTHEON_FACTORY_RAIL_SECRET:'legacy-pantheon-secret',
    METROPOLIS_FACTORY_RAIL_SECRET:'legacy-metropolis-secret'};
  return {app:createFactoryWorker(env,{recordStore:store,domainRunners}),bucket,
    get effects(){return effects;}};
}
const body=(requestId=REQ,domain='CODE',specification=spec)=>
  ({requestId,domain,spec:specification,expectedSourceSha:SHA});
const call=async(app,req)=>{const r=await app.fetch(req);return {status:r.status,data:await r.json()};};

test('Factory generates its own Job ID, scopes machine and returns artifact receipt without caller Work Pass',async()=>{
  const f=fixture();
  const a=await call(f.app,await signed('/station/go-job',{payload:body()}));
  assert.equal(a.status,200,JSON.stringify(a));
  assert.match(a.data.jobId,/^GOJOB-[a-f0-9]{32}$/);
  assert.equal(a.data.jobId,await factoryJobId(REQ));
  assert.equal(a.data.requestId,REQ);
  assert.equal(a.data.readback.originSystem,'go-together');
  assert.equal(a.data.readback.domainVerified,true);
  assert.equal(a.data.readback.workId,a.data.jobId);
  assert.equal(a.data.readback.machineResult.run.workId,a.data.jobId);
  assert.equal(f.effects,1);
  const inputKey=[...f.bucket.values.keys()].find(k=>k.startsWith('edge-inputs/go-'));
  assert.ok(inputKey);
  const reread=await f.bucket.get(inputKey);
  const job=JSON.parse(await reread.text());
  assert.equal(job.workId,a.data.jobId);
  assert.equal(job.baseSource,spec.baseSource);
  const receipt=await call(f.app,await signed('/station/readback/'+a.data.receiptId,{method:'GET'}));
  assert.equal(receipt.status,200);
  assert.equal(receipt.data.domainVerified,true);
  const cityRead=await call(f.app,await signed('/station/readback/'+a.data.receiptId,{
    method:'GET',client:'CITY',key:'legacy-metropolis-secret'}));
  assert.equal(cityRead.status,403);
  assert.equal(cityRead.data.reason,'GO_RECEIPT_REQUIRES_GO_RAIL');
  const status=await call(f.app,await signed('/station/go-job-status',{payload:{requestId:REQ}}));
  assert.equal(status.status,200);
  assert.equal(status.data.receiptId,a.data.receiptId);
  const ref=a.data.readback.result.artifactRefs[0];
  const file=await f.app.fetch(await signed('/station/go-artifact',{
    payload:{receiptId:a.data.receiptId,artifactRef:ref}}));
  assert.equal(file.status,200);
  assert.equal(await file.text(),'export default "after"');
  const replay=await call(f.app,await signed('/station/go-job',{payload:body()}));
  assert.equal(replay.status,200,JSON.stringify(replay));
  assert.equal(replay.data.receiptId,a.data.receiptId);
  assert.equal(f.effects,1);
});
test('same requestId with different scope or contents cannot trigger another effect',async()=>{
  const f=fixture();
  const a=await call(f.app,await signed('/station/go-job',{payload:body()}));
  assert.equal(a.status,200);
  const b=await call(f.app,await signed('/station/go-job',{
    payload:body(REQ,'CODE',{...spec,patch:{find:'before',replace:'changed'}})}));
  assert.equal(b.status,409,JSON.stringify(b));
  assert.equal(b.data.reason,'FACTORY_WORK_SCOPE_CONFLICT');
  assert.equal(f.effects,1);
});
test('VISUAL bounded card and LOGIC trainee do not require City Work Pass',async()=>{
  const visual=fixture();
  const v=await call(visual.app,await signed('/station/go-job',{payload:body(REQ,'VISUAL',{
    design:{title:'Factory',body:'Ready',accent:'#663399'},viewport:{width:800,height:600}
  })}));
  assert.equal(v.status,200,JSON.stringify(v));assert.equal(v.data.domain,'VISUAL');
  assert.equal(v.data.readback.result.artifactRefs[0].endsWith('render.png'),true);
  const logic=fixture();
  const l=await call(logic.app,await signed('/station/go-job',{payload:body(REQ,'LOGIC',{placement:'DWARF-01_TRAINING'})}));
  assert.equal(l.status,200,JSON.stringify(l));assert.equal(l.data.domain,'LOGIC');
  assert.deepEqual(l.data.readback.result.artifactRefs,[]);
});
test('legacy principals, placeholders, missing scope and spoofed pass reject GO-only job API',async()=>{
  const f=fixture();
  const payload=body();
  for(const wrong of [
    {client:'CITY',key:'legacy-metropolis-secret'},
    {client:'PANTHEON',key:'legacy-pantheon-secret'},
    {key:'f'.repeat(64)}]){
    const r=await call(f.app,await signed('/station/go-job',{payload,...wrong}));
    assert.notEqual(r.status,200);
  }
  for(const injected of [
    {...payload,workPass:{kind:'WORK_PASS'}},
    {...payload,workId:'invented'},
    {...payload,domain:'UNKNOWN'},
    {...payload,spec:{...spec,tests:[]}},
    {...payload,requestId:'not-a-uuid'},
    {...payload,expectedSourceSha:'f'.repeat(40)}
  ]) {
    const r=await call(f.app,await signed('/station/go-job',{payload:injected}));
    assert.notEqual(r.status,200);
  }
  const placeholder=fixture('PENDING_REPLACE_FACTORY_SIDE_20261023_INACTIVE');
  const blocked=await call(placeholder.app,await signed('/station/go-job',{payload}));
  assert.equal(blocked.status,503);assert.equal(blocked.data.reason,'GO_FACTORY_RAIL_KEY_NOT_CONFIGURED');
  assert.equal(f.effects,0);
});
test('GO cannot submit Work Pass directly on old Station route',async()=>{
  const f=fixture();
  const old=await call(f.app,await signed('/station/receive',{payload:{workId:'BAD'}}));
  assert.equal(old.status,403);assert.equal(old.data.reason,'GO_USE_JOB_ROUTE');
});
test('GO artifact path is restricted to exact receipt and other principals are denied',async()=>{
  const f=fixture();
  const created=await call(f.app,await signed('/station/go-job',{payload:body()}));
  assert.equal(created.status,200);
  const ref=created.data.readback.result.artifactRefs[0];
  const bad=await call(f.app,await signed('/station/go-artifact',{
    payload:{receiptId:created.data.receiptId,artifactRef:'r2://factory/edge-results/some/else/main.js'}}));
  assert.equal(bad.status,403);
  const nonGo=await call(f.app,await signed('/station/go-artifact',{
    payload:{receiptId:created.data.receiptId,artifactRef:ref},
    client:'CITY',key:'legacy-metropolis-secret'}));
  assert.equal(nonGo.status,403);
});
