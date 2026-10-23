import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createL1Runtime,L1_INTENT,L1_SCOPE,L1_RECEIPT_ID} from '../src/l1-runtime.mjs';
import {createInMemoryDurableDriver} from './support/in-memory-durable-driver.mjs';
import {validatePantheonHandoff} from '../src/rail-auth.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/l1-task-local.json',import.meta.url)));
const id=f.task_id,cp='cp-'+id,sha='9a56fded285641a37fdf9a92c388f546ccb9d47f';
const input=()=>({workId:id,checkpointId:cp,ownerDomain:'LOGIC',intent:L1_INTENT,scope:[L1_SCOPE],inputRefs:[],requestText:f.recorded_request_text,requestSha256:f.recorded_request_sha256,source:{stationId:'PANTHEON',system:'pantheon-workhub'},target:{stationId:'FACTORY-STATION',system:'factory-district',component:'FACTORY_HALL'},workPassRef:'work-pass://pantheon-'+id,workPass:{kind:'WORK_PASS',version:'WORK_PASS_V1',status:'ACTIVE',passId:'pantheon-'+id,actor:'PANTHEON',workId:id,checkpointId:cp,permissions:{actions:['handoff'],handoff:[{stationId:'FACTORY_STATION'}]},authorityTransferred:false}});
test('exact L1 permission denies alternate identity, scope, pass, hash and unexpected fields',async()=>{
 assert.deepEqual(validatePantheonHandoff(input()),input());
 for(const patch of [{intent:'PLACE_DWARF_LOGIC_TRAINEE',scope:['EXECUTE:LOGIC']},{workId:'task_'+'a'.repeat(32)},{checkpointId:'other'},{requestSha256:'0'.repeat(64)},{scope:['EXECUTE:LOGIC']},{inputRefs:['https://external']},{operation:'execute'},{workPass:{...input().workPass,actor:'CITY'}},{workPassRef:'other'}])assert.throws(()=>validatePantheonHandoff({...input(),...patch}));
 await assert.rejects(createL1Runtime(createInMemoryDurableDriver(),sha).preflight({...input(),requestText:f.recorded_request_text+'x'}),/HASH_MISMATCH/);
});
test('eight concurrent receives produce one immutable artifact+receipt record; restart/reconcile preserves timestamp',async()=>{
 const driver=createInMemoryDurableDriver();let writes=0;const put=driver.put;driver.put=async(...args)=>{const r=await put(...args);writes++;return r;};
 const runtime=createL1Runtime(driver,sha,{clock:()=> '2026-10-22T03:10:00.000Z'});
 const out=await Promise.all(Array.from({length:8},()=>runtime.receive(input())));
 assert.equal(writes,1);for(const r of out){assert.equal(r.receipt.receiptId,L1_RECEIPT_ID);assert.deepEqual(r.readback,out[0].readback);}
 const restarted=createL1Runtime(driver,sha,{clock:()=> '2027-01-01T00:00:00.000Z'});
 assert.deepEqual((await restarted.receive(input())).readback,out[0].readback);
 assert.deepEqual((await restarted.reconcile(input())).readback,out[0].readback);assert.equal(writes,1);
});
test('write committed but response lost recovers existing record without repeating effect',async()=>{
 const driver=createInMemoryDurableDriver();let effects=0;const put=driver.put;driver.put=async(...args)=>{await put(...args);effects++;throw Error('lost response');};
 const r=createL1Runtime(driver,sha);assert.equal((await r.receive(input())).status,'RECOVERED');assert.equal(effects,1);assert.equal((await r.readback()).domainVerified,true);
});
test('pre-write failure and reconciliation never fabricate an artifact; corrupted bytes fail closed',async()=>{
 const driver=createInMemoryDurableDriver();const put=driver.put;driver.put=async()=>{throw Error('storage unavailable');};
 const r=createL1Runtime(driver,sha);await assert.rejects(r.receive(input()));assert.equal((await r.reconcile(input())).status,'UNKNOWN');assert.equal((await r.readback()).reason,'RECEIPT_NOT_FOUND');
 driver.put=put;await r.receive(input());const get=driver.get;driver.get=async k=>{const v=await get(k);if(v)v.value.artifact.content+='tamper';return v;};await assert.rejects(r.readback(),/EVIDENCE_MISMATCH/);
});
