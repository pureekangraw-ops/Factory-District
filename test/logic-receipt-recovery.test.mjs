import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryRuntime} from '../src/factory-runtime.mjs';
import {createDurableStore} from '../src/durable-store.mjs';
import {createDwarfLogicTraineeRunner} from '../src/dwarf-logic-trainee.mjs';
import {createInMemoryDurableDriver} from './support/in-memory-durable-driver.mjs';

const workId='task_'+'b'.repeat(32);
const checkpointId='cp-'+workId;
function work(){
 return {workId,checkpointId,ownerDomain:'LOGIC',intent:'PLACE_DWARF_LOGIC_TRAINEE',
  scope:['EXECUTE:LOGIC'],inputRefs:[],
  source:{stationId:'PANTHEON',system:'pantheon-workhub'},
  target:{stationId:'FACTORY-STATION',system:'factory-district',component:'FACTORY_HALL'},
  workPassRef:'work-pass://pantheon-'+workId,
  workPass:{kind:'WORK_PASS',version:'WORK_PASS_V1',passId:'pantheon-'+workId,
   actor:'PANTHEON',status:'ACTIVE',workId,checkpointId,
   permissions:{actions:['handoff'],handoff:[{stationId:'FACTORY_STATION'}]}}};
}
test('lost receipt after durable LOGIC effect is safely reconstructed without machine replay',async()=>{
 const driver=createInMemoryDurableDriver();
 let failReceipt=true;
 const failingStore=createDurableStore({driver:{...driver,async put(key,value,options){
  if(key.startsWith('factory/receipt/')&&failReceipt){failReceipt=false;throw Error('SIMULATED_RECEIPT_IO_FAILURE');}
  return driver.put(key,value,options);
 }}});
 const realRunner=createDwarfLogicTraineeRunner({store:failingStore});
 let executions=0;
 const runtime=createFactoryRuntime({sourceSha:'sha-test',recordStore:failingStore,
  domainHandlers:{LOGIC:async ({handoff})=>{
   executions++;
   const result=await realRunner({work:handoff});
   return {status:'RETURNED',completed:true,machineResult:result};
  }}});
 await assert.rejects(runtime.receive(work()),/SIMULATED_RECEIPT_IO_FAILURE/);
 assert.equal(executions,1);
 const repeated=await runtime.receive(work());
 assert.equal(repeated.readback.reason,'FACTORY_EFFECT_UNRECONCILED');
 assert.equal(executions,1);
 const recovered=await runtime.reconcile(work());
 assert.equal(recovered.status,'RECOVERED');
 assert.equal(recovered.readback.domainVerified,true);
 assert.equal(recovered.readback.recoveryBasis,'PERSISTED_DWARF_LOGIC_TRAINEE');
 assert.equal(recovered.readback.result.evidenceRefs.length,1);
 assert.equal((await runtime.readback(recovered.receipt.receiptId)).domainVerified,true);
 const again=await runtime.reconcile(work());
 assert.equal(again.status,'RECORDED');
 assert.equal(again.receipt.receiptId,recovered.receipt.receiptId);
 assert.equal(executions,1);
});
test('reconciliation never creates evidence when no LOGIC effect was persisted',async()=>{
 const driver=createInMemoryDurableDriver();
 const store=createDurableStore({driver});
 const runtime=createFactoryRuntime({sourceSha:'sha-test',recordStore:store,
  domainHandlers:{LOGIC:async()=>({status:'UNKNOWN'})}});
 const r=await runtime.receive(work());
 assert.equal(r.readback.domainVerified,false);
 assert.equal((await runtime.reconcile(work())).status,'RECORDED');
 const none=await runtime.reconcile({...work(),workId:'task_'+'a'.repeat(32),
  checkpointId:'cp-'+'task_'+'a'.repeat(32),
  workPassRef:'work-pass://pantheon-'+'task_'+'a'.repeat(32),
  workPass:{...work().workPass,workId:'task_'+'a'.repeat(32),checkpointId:'cp-'+'task_'+'a'.repeat(32),passId:'pantheon-'+'task_'+'a'.repeat(32)}});
 assert.equal(none.status,'UNKNOWN');
 assert.equal(none.reason,'FACTORY_CLAIM_NOT_FOUND');
});
test('recovery rejects changed command under same Work identity',async()=>{
 const driver=createInMemoryDurableDriver(),store=createDurableStore({driver});
 const runtime=createFactoryRuntime({recordStore:store,sourceSha:'sha',
  domainHandlers:{LOGIC:async()=>({status:'UNKNOWN'})}});
 await runtime.receive(work());
 await assert.rejects(runtime.reconcile({...work(),intent:'IMPORT_GOLDEN_CASES'}),/FACTORY_WORK_SCOPE_CONFLICT/);
});
