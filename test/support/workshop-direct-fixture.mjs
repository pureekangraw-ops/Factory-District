import assert from 'node:assert/strict';
import worker from '../../src/worker.mjs';
import { createLocalR2Bucket } from './local-r2-bucket.mjs';
import { createBoundedWorkshopProvider } from '../../src/bounded-workshop-provider.mjs';
import { railRequest } from './rail-auth.mjs';

export function directWorkshopFixture() {
  const bucket=createLocalR2Bucket(), provider=createBoundedWorkshopProvider({ARTIFACTS:bucket});
  const secret='LOCAL-ONLY-OPAQUE-KEY!0123456789+ABCDEFGHIJK';
  const env={RECORD_STORE:bucket,SOURCE_SHA:'a'.repeat(40),GO_FACTORY_RAIL_SECRET:secret,METROPOLIS_FACTORY_RAIL_SECRET:'LOCAL-CITY-ONLY',
    CODE_PROVIDER:{workshopAuthorize:input=>provider.authorize(input),workshopRunCase:input=>provider.runCase(input)}};
  const call=async(path,body,client='GO')=>worker.fetch(await railRequest('https://local.invalid'+path,{method:body===undefined?'GET':'POST',body:body===undefined?'':JSON.stringify(body),secret:client==='GO'?secret:env.METROPOLIS_FACTORY_RAIL_SECRET,headers:client==='GO'?{'x-factory-client':'GO'}:{}}),env);
  const client={
    async put(content){const response=await call('/station/go-workshop-content',{content,expectedSourceSha:env.SOURCE_SHA});const r=await response.json();assert.equal(response.status,200,JSON.stringify(r));return r;},
    async submit(command,requestId=crypto.randomUUID()){
      const response=await call('/station/go-job',{domain:'LOGIC',spec:{workshop:command},requestId,expectedSourceSha:env.SOURCE_SHA});
      const r=await response.json();return {...r,ok:response.ok,workshopResult:r.readback?.machineResult?.workshopResult};
    },
    async delivery(receiptId,artifactRef){const response=await call('/station/go-artifact',{receiptId,artifactRef});assert.equal(response.status,200);return response.json();},
    async read(receiptId){return (await call('/station/readback/'+receiptId)).json();},
  };
  return {env,bucket,provider,call,client};
}

export async function exerciseWorkshop(client,kind) {
  const subjectId=`DIRECT-${kind}`, receiptIds=[];let n=0;
  const put=content=>client.put(content);
  const run=async(fields,pass=true)=>{
    const command={subjectId,operationId:`${kind}-${++n}`,...fields},requestId=crypto.randomUUID();
    const first=await client.submit(command,requestId);receiptIds.push(first.receiptId);
    assert.equal(first.ok,pass,JSON.stringify(first));
    assert.equal(first.workshopResult?.status,pass?'PASS':'FAIL',JSON.stringify(first));
    const repeated=await client.submit(command,requestId);assert.equal(repeated.receiptId,first.receiptId);
    assert.deepEqual(repeated.workshopResult,first.workshopResult);
    return first;
  };
  const schema=await put({type:'object'});
  const policy=await put({maxRules:16,allowedFields:['text']}),authority=await put({mode:'ADVISORY_ONLY',tools:[]});
  const prompt=await put({mode:'RULE_BASED',text:'Classify supplied text with explicit rules; no inference.'});
  const graph=await put({allowedOps:['ADD','MULTIPLY']});
  const manifest=await put(kind==='AGENT'?{role:'advisory classifier',promptRef:prompt.ref,policyRef:policy.ref,authorityRef:authority.ref,toolCapabilityRefs:[]}
    :{workflowGraphRef:graph.ref,stepContracts:[],toolRefs:[],timeoutPolicyRef:policy.ref,retryPolicyRef:policy.ref,idempotencyPolicyRef:policy.ref,recoveryPolicyRef:policy.ref});
  const initial=await put(kind==='AGENT'?{adapter:'RULE_AGENT_V1',rules:[],defaultOutput:'normal'}:{adapter:'PIPELINE_RUNNER_V1',steps:[{op:'ADD',value:0}]});
  const changed=await put(kind==='AGENT'?{adapter:'RULE_AGENT_V1',rules:[{field:'text',contains:'urgent',output:'high'}],defaultOutput:'normal'}:{adapter:'PIPELINE_RUNNER_V1',steps:[{op:'ADD',value:1},{op:'MULTIPLY',value:2}]});
  const input=await put(kind==='AGENT'?{text:'urgent delivery'}:{value:1}),expected=await put(kind==='AGENT'?'high':4),environment=await put({runtime:'BOUNDED_WORKSHOP_V1',network:false});
  const suite=await put({cases:[{caseId:'actual-result',inputRef:input.ref,expectedRef:expected.ref}]});
  await run({operation:'REGISTER_SUBJECT',kind,ownerSystem:'go-together',manifestRef:manifest.ref,inputSchemaRef:schema.ref,outputSchemaRef:schema.ref});
  await run({operation:'CAPTURE_BASELINE',baselineId:'B1',initialImportedConfig:true,configRef:initial.ref,configSha256:initial.sha256,testSuiteRef:suite.ref,testSuiteSha256:suite.sha256,environmentRef:environment.ref});
  const candidate=(versionId,config,extra={})=>run({operation:'CREATE_CANDIDATE',versionId,baselineId:'B1',configRef:config.ref,configSha256:config.sha256,changeNote:'explicit bounded adjustment',...extra});
  const testRun=(testRunId,versionId)=>run({operation:'RUN_TEST_SUITE',testRunId,versionId,baselineId:'B1',suiteRef:suite.ref,suiteSha256:suite.sha256,environmentRef:environment.ref});
  await candidate('V1',initial);const baseline=await testRun('BASE',null),failed=await testRun('FAILED','V1');
  assert.equal(baseline.workshopResult.output.status,'FAIL');assert.equal(failed.workshopResult.output.status,'FAIL');
  await run({operation:'RECORD_RCA',rcaId:'RCA',versionId:'V1',failedTestRunRefs:['FAILED'],hypothesis:'initial config misses required transformation',proposedAdjustment:'change explicit rule/pipeline'});
  await candidate('V2',changed,{parentVersionId:'V1',rcaId:'RCA'});
  const passed=await testRun('PASSED','V2');assert.equal(passed.workshopResult.output.status,'PASS');
  const compared=await run({operation:'COMPARE_BASELINE',comparisonId:'CMP',baselineTestRunId:'BASE',candidateTestRunId:'PASSED'});
  assert.equal(compared.workshopResult.output.deltas.passed,1);
  await run({operation:'OWNER_QUALIFY',decisionId:'10',versionId:'V2',comparisonId:'CMP',decision:'QUALIFIED',ownerDecisionRef:'fixture://owner/approve'});
  await run({operation:'OWNER_QUALIFY',decisionId:'2',versionId:'V2',comparisonId:'CMP',decision:'REJECTED',ownerDecisionRef:'fixture://owner/reject'});
  await run({operation:'EXPORT_PACKAGE',packageId:'REJECTED',versionId:'V2',decisionId:'10'},false);
  await run({operation:'OWNER_QUALIFY',decisionId:'LATEST',versionId:'V2',comparisonId:'CMP',decision:'QUALIFIED',ownerDecisionRef:'fixture://owner/reapprove'});
  const exported=await run({operation:'EXPORT_PACKAGE',packageId:'PACKAGE',versionId:'V2',decisionId:'LATEST'});
  const delivery=await client.delivery(exported.receiptId,exported.workshopResult.output.ref);
  assert.equal(delivery.receipt.receiptId,exported.receiptId);
  assert.equal(delivery.readback.domainVerified,true);
  assert.equal(delivery.package.candidate.versionId,'V2');
  assert.equal(delivery.package.decision.decisionId,'LATEST');
  assert.equal(delivery.package.productionPublished,false);
  return {kind,receiptIds,exported,delivery};
}
