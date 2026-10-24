import { createR2RecordStore } from './r2-record-store.mjs';
import { readWorkshopContent, workshopHash } from './logic-workshop.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const only=(x,keys)=>plain(x)&&Object.keys(x).every(k=>keys.includes(k));
export function createBoundedWorkshopProvider(env) {
  const store=createR2RecordStore(env.ARTIFACTS);
  async function authorize({command,work,ownerSystem}) {
    const denied={allowed:false};
    if(!/^GOJOB-[a-f0-9]{32}$/.test(work?.workId||'')||work.checkpointId!=='CP-'+work.workId
      ||work.actingActor!=='GO'||work.source?.system!=='go-together'||work.source?.stationId!=='GO-BRAIN'
      ||work.intent!=='LOGIC_WORKSHOP'||work.ownerDomain!=='LOGIC'||!work.scope?.includes('EXECUTE:LOGIC')
      ||work.workPassRef!==`work-pass://factory-go-${work.workId}`||ownerSystem!=='go-together') return denied;
    const grant=(await store.get(`logic/workshop/v1/go-grants/${work.workId}`))?.value;
    if(!grant||grant.commandSha256!==await workshopHash(command)||grant.commandRef!==work.inputRefs?.[0]
      ||work.inputRefs.length!==1||grant.checkpointId!==work.checkpointId) return denied;
    return {allowed:true,actor:'GO',ownerSystem,subjectId:command.subjectId,operationId:command.operationId,operation:command.operation,
      testInputsApproved:true,...(command.operation==='OWNER_QUALIFY'?{ownerDecisionRef:command.ownerDecisionRef,qualificationApproved:command.decision==='QUALIFIED'}:{})};
  }
  async function runCase({subject,config,input,work}) {
    // Independently require the signed-command grant at the execution boundary.
    const command=await readWorkshopContent(store,work.inputRefs?.[0]);
    if(!(await authorize({command,work,ownerSystem:subject.ownerSystem})).allowed||command.operation!=='RUN_TEST_SUITE'||command.subjectId!==subject.subjectId) fail('WORKSHOP_AUTHORITY_DENIED');
    const manifest=await readWorkshopContent(store,subject.manifestRef);
    if(subject.kind==='AGENT') {
      if(manifest.providerRef||manifest.modelRef||manifest.toolCapabilityRefs?.length) fail('WORKSHOP_EXTERNAL_AGENT_UNSUPPORTED');
      const prompt=await readWorkshopContent(store,manifest.promptRef),policy=await readWorkshopContent(store,manifest.policyRef),authority=await readWorkshopContent(store,manifest.authorityRef);
      if(prompt.mode!=='RULE_BASED'||typeof prompt.text!=='string'||authority.mode!=='ADVISORY_ONLY'||!Array.isArray(authority.tools)||authority.tools.length
        ||!Array.isArray(policy.allowedFields)||!Number.isInteger(policy.maxRules)||policy.maxRules<1||policy.maxRules>16) fail('WORKSHOP_AGENT_POLICY_INVALID');
      if(!only(config,['adapter','rules','defaultOutput'])||config.adapter!=='RULE_AGENT_V1'||!Array.isArray(config.rules)||config.rules.length>policy.maxRules||!plain(input)) fail('WORKSHOP_AGENT_CONFIG_INVALID');
      // Validate every rule before selecting one, including currently unreachable rules.
      for(const rule of config.rules) if(!only(rule,['field','contains','output'])||!policy.allowedFields.includes(rule.field)
        ||!Object.hasOwn(input,rule.field)||typeof input[rule.field]!=='string'||input[rule.field].length>4096
        ||typeof rule.contains!=='string'||!rule.contains.length||rule.contains.length>128||!Object.hasOwn(rule,'output')) fail('WORKSHOP_AGENT_RULE_INVALID');
      const selected=config.rules.find(rule=>input[rule.field].includes(rule.contains));
      const output=selected?selected.output:config.defaultOutput;
      await workshopHash(output); return structuredClone(output);
    }
    if(subject.kind==='RUNNER') {
      const graph=await readWorkshopContent(store,manifest.workflowGraphRef);
      if(manifest.toolRefs?.length||!Array.isArray(graph.allowedOps)) fail('WORKSHOP_RUNNER_GRAPH_INVALID');
      if(!only(config,['adapter','steps'])||config.adapter!=='PIPELINE_RUNNER_V1'||!Array.isArray(config.steps)||config.steps.length<1||config.steps.length>16
        ||!only(input,['value'])||typeof input.value!=='number'||!Number.isFinite(input.value)) fail('WORKSHOP_RUNNER_CONFIG_INVALID');
      let value=input.value;
      for(const step of config.steps) {
        if(!only(step,['op','value'])||!['ADD','MULTIPLY'].includes(step.op)||!graph.allowedOps.includes(step.op)||typeof step.value!=='number'||!Number.isFinite(step.value)||Math.abs(step.value)>1000000) fail('WORKSHOP_RUNNER_STEP_INVALID');
        value=step.op==='ADD'?value+step.value:value*step.value;
        if(!Number.isFinite(value)||Math.abs(value)>1e12) fail('WORKSHOP_RUNNER_OUTPUT_LIMIT');
      }
      return value;
    }
    fail('WORKSHOP_SUBJECT_KIND_UNSUPPORTED');
  }
  return {authorize,runCase};
}
