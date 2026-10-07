import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixieOperator } from '../src/pixie-autonomous.mjs';
const input={work:{workId:'W'},domain:'CODE',machineId:'CODE-MACHINE',authorityRef:'AUTH'};
test('PIXIE rejects invalid retry budgets at construction',()=>{
 for(const maxAttempts of [0,-1,1.5,NaN,Infinity,'2',11]) assert.throws(()=>createPixieOperator({maxAttempts}),/maxAttempts/);
});
test('PIXIE never retries thrown authority denial',async()=>{
 let calls=0;const pixie=createPixieOperator({maxAttempts:3,domainRunners:{CODE:async()=>{calls++;throw Object.assign(new Error('owner denied'),{code:'AUTHORITY_DENIED',retryable:true});}}});
 const result=await pixie.run(input);assert.equal(result.status,'BLOCKED');assert.equal(calls,1);assert.equal(result.failure.class,'AUTHORITY_DENIED');
});
test('PIXIE handles non-Error throws without leaking raw provider data',async()=>{
 for(const error of [null,'Bearer private-credential',new Error('token=private-credential')]) {
  const pixie=createPixieOperator({domainRunners:{CODE:async()=>{throw error;}}});
  const result=await pixie.run(input);assert.equal(result.status,'UNKNOWN');assert.ok(result.failure.class);assert.ok(!JSON.stringify(result).includes('private-credential'));
 }
});
test('PIXIE preserves an immutable baseline of work across retries',async()=>{
 const seen=[];const original={workId:'W',checkpointId:'CP',inputRefs:['input://1']};
 const pixie=createPixieOperator({maxAttempts:2,domainRunners:{CODE:async({work})=>{seen.push(structuredClone(work));work.workId='OTHER';work.inputRefs.push('poison');return {retryable:true,run:{executionState:'UNKNOWN'}};}}});
 const result=await pixie.run({...input,work:original});assert.equal(result.status,'UNKNOWN');assert.equal(seen[1].workId,'W');assert.deepEqual(seen[1].inputRefs,['input://1']);assert.equal(original.workId,'W');
});
test('PIXIE rejects returned work or machine identity conflicts',async()=>{
 for(const run of [{workId:'OTHER',machineId:'CODE-MACHINE',domain:'CODE'},{workId:'W',machineId:'OTHER',domain:'CODE'},{workId:'W',machineId:'CODE-MACHINE',domain:'VISUAL'}]) {
  const pixie=createPixieOperator({domainRunners:{CODE:async()=>({run:{...run,executionState:'COMPLETE',returnState:'RETURNED'}})}});
  const result=await pixie.run(input);assert.equal(result.status,'UNKNOWN');assert.equal(result.failure.code,'MACHINE_IDENTITY_MISMATCH');
 }
});
