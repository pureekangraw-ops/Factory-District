import { WORKSHOP_OPERATIONS, putWorkshopContent, workshopHash } from './logic-workshop.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validateWorkshopCommand(c) {
  if(!c||typeof c!=='object'||Array.isArray(c)||!WORKSHOP_OPERATIONS.includes(c.operation)) fail('GO_WORKSHOP_COMMAND_INVALID');
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(c.subjectId||'')||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(c.operationId||'')) fail('GO_WORKSHOP_ID_INVALID');
  if(c.operation==='REGISTER_SUBJECT'&&c.ownerSystem!=='go-together') fail('GO_WORKSHOP_OWNER_INVALID');
  if(c.operation==='OWNER_QUALIFY' && (!['QUALIFIED','REJECTED'].includes(c.decision)||typeof c.ownerDecisionRef!=='string'||!c.ownerDecisionRef.trim()||c.ownerDecisionRef.length>256)) fail('GO_WORKSHOP_OWNER_DECISION_REQUIRED');
}
// Called only after the existing GO signature and expected source checks.
export async function prepareWorkshopCommand(store,{jobId,command}) {
  validateWorkshopCommand(command);
  const content=await putWorkshopContent(store,command);
  const key=`logic/workshop/v1/go-grants/${jobId}`;
  const grant={jobId,checkpointId:'CP-'+jobId,commandSha256:await workshopHash(command),commandRef:content.ref,actor:'GO',ownerSystem:'go-together',subjectId:command.subjectId,operationId:command.operationId,operation:command.operation};
  const existing=await store.get(key);
  if(!existing) {
    try { await store.put(key,grant,{expectedVersion:0}); }
    catch(error) { if(error.message!=='DURABLE_CONFLICT') throw error; }
  }
  const saved=(await store.get(key))?.value;
  if(!saved||JSON.stringify(saved)!==JSON.stringify(grant)) fail('GO_WORKSHOP_REQUEST_CONFLICT');
  return content.ref;
}
