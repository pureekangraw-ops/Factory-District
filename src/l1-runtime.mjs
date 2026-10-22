import {formatL1Artifact,L1_TASK_ID,L1_REQUEST_SHA256} from './l1-text-artifact.mjs';
export const L1_INTENT='CREATE_L1_TEXT_ARTIFACT';
export const L1_SCOPE='EXECUTE:TEXT_ARTIFACT:L1';
export const L1_RECEIPT_ID='receipt-l1-'+L1_TASK_ID.slice(5);
const key=`factory/l1/${L1_TASK_ID}/${L1_REQUEST_SHA256}`;
export const L1_ARTIFACT_REF=`factory-artifact://${key}`;
const deny=()=>{throw Object.assign(Error('PANTHEON_L1_SCOPE_DENIED'),{code:'PANTHEON_L1_SCOPE_DENIED'});};
export function validateL1Fields(input){
 const allowed=['workId','checkpointId','ownerDomain','intent','scope','inputRefs','source','target','workPassRef','workPass','requestText','requestSha256'];
 if(Object.keys(input).some(k=>!allowed.includes(k)) || input.workId!==L1_TASK_ID || input.requestSha256!==L1_REQUEST_SHA256 || input.intent!==L1_INTENT || input.ownerDomain!=='LOGIC' || JSON.stringify(input.scope)!==JSON.stringify([L1_SCOPE]) || typeof input.requestText!=='string' || input.requestText.length>4096)deny();
 return input;
}
export function createL1Runtime(store,sourceSha,{clock=()=>new Date().toISOString()}={}){
 async function verify(record){
  if(!record)return null;
  const v=record.value;
  const a=await formatL1Artifact({taskId:L1_TASK_ID,requestText:v.requestText,requestSha256:L1_REQUEST_SHA256,testTimestamp:v.artifact?.testTimestamp});
  if(record.version!==1 || JSON.stringify(v.artifact)!==JSON.stringify(a) || v.receiptId!==L1_RECEIPT_ID || v.artifactRef!==L1_ARTIFACT_REF || !/^[a-f0-9]{40}$/.test(v.sourceSha))throw Error('L1_DURABLE_EVIDENCE_MISMATCH');
  return v;
 }
 function back(v){return {status:'HANDOFF_VERIFIED',receiptId:v.receiptId,workId:L1_TASK_ID,checkpointId:'cp-'+L1_TASK_ID,workPassRef:'work-pass://pantheon-'+L1_TASK_ID,actingActor:'PANTHEON',boundaryVerified:true,domainCompleted:true,domainVerified:true,sourceSha:v.sourceSha,evidenceRef:v.artifactRef,result:{...v.artifact,artifactRef:v.artifactRef,evidenceRefs:[v.artifactRef]}};}
 function output(v,status){return {status,receipt:{receiptId:v.receiptId,workId:L1_TASK_ID,checkpointId:'cp-'+L1_TASK_ID,workPassRef:'work-pass://pantheon-'+L1_TASK_ID},readback:back(v)};}
 return {
  async preflight(input){validateL1Fields(input);await formatL1Artifact({taskId:input.workId,requestText:input.requestText,requestSha256:input.requestSha256,testTimestamp:'2000-01-01T00:00:00.000Z'});if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('L1_SOURCE_IDENTITY_REQUIRED');return {status:'READY',allowed:true,workId:L1_TASK_ID,checkpointId:input.checkpointId,workPassRef:input.workPassRef,sourceSha,dispatched:false};},
  async receive(input){
   await this.preflight(input);
   let v=await verify(await store.get(key));if(v)return output(v,'RECORDED');
   // One immutable CAS record contains the claim timestamp, artifact and receipt.
   // No intermediate durable state, append, runner or external effect can be duplicated.
   const artifact=await formatL1Artifact({taskId:input.workId,requestText:input.requestText,requestSha256:input.requestSha256,testTimestamp:clock()});
   const value={requestText:input.requestText,artifact,receiptId:L1_RECEIPT_ID,artifactRef:L1_ARTIFACT_REF,sourceSha};
   try{await store.put(key,value,{expectedVersion:0});}catch(error){
    v=await verify(await store.get(key));if(v)return output(v,'RECOVERED');throw error;
   }
   v=await verify(await store.get(key));if(!v)throw Error('L1_WRITE_UNVERIFIED');return output(v,'RECORDED');
  },
  async reconcile(input){await this.preflight(input);const v=await verify(await store.get(key));return v?output(v,'RECOVERED'):{status:'UNKNOWN',reason:'L1_EFFECT_NOT_FOUND'};},
  async readback(){const v=await verify(await store.get(key));return v?back(v):{status:'UNKNOWN',reason:'RECEIPT_NOT_FOUND'};}
 };
}
