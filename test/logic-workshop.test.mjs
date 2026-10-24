import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogicWorkshop, putWorkshopContent, readWorkshopContent, readWorkshopDelivery } from '../src/logic-workshop.mjs';
import { createDurableStore } from '../src/durable-store.mjs';
import { createInMemoryDurableDriver } from './support/in-memory-durable-driver.mjs';
import { createR2RecordStore } from '../src/r2-record-store.mjs';
import { createLocalR2Bucket } from './support/local-r2-bucket.mjs';
import { railRequest } from './support/rail-auth.mjs';
import worker from '../src/worker.mjs';

async function setup(kind='AGENT', useWorker=false) {
  const bucket=createLocalR2Bucket();
  const store=useWorker?createR2RecordStore(bucket):createDurableStore({driver:createInMemoryDurableDriver()});
  let calls=0, approved=true, sequence=0;
  const provider={
    authorize:async({command,work,ownerSystem})=>({allowed:true,subjectId:command.subjectId,operation:command.operation,operationId:command.operationId,actor:work.actingActor,ownerSystem,testInputsApproved:true,
      ...(approved?{ownerDecisionRef:'fixture://owner/decision',qualificationApproved:true}:{})}),
    runCase:async({config,input})=>{ calls++; if(config.crash) throw Error('DO_NOT_LEAK_PROVIDER_DETAIL'); return input.value+config.increment; },
  };
  const workshop=createLogicWorkshop({store,provider});
  const put=value=>putWorkshopContent(store,value);
  const schema=await put({type:'object'}), prompt=await put({text:'synthetic'});
  const manifest=await put(kind==='AGENT'?{role:'synthetic',promptRef:prompt.ref,toolCapabilityRefs:[],policyRef:prompt.ref,authorityRef:prompt.ref}
    :{workflowGraphRef:prompt.ref,stepContracts:[],toolRefs:[],timeoutPolicyRef:prompt.ref,retryPolicyRef:prompt.ref,idempotencyPolicyRef:prompt.ref,recoveryPolicyRef:prompt.ref});
  const config=await put({increment:0}), improved=await put({increment:1}), crashed=await put({crash:true});
  const input=await put({value:1}), expected=await put(2);
  const suite=await put({cases:[{caseId:'one',inputRef:input.ref,expectedRef:expected.ref}]});
  const environment=await put({runtime:'synthetic-v1'});
  const env={RECORD_STORE:bucket,SOURCE_SHA:'LOCAL-SOURCE',METROPOLIS_FACTORY_RAIL_SECRET:'LOCAL-FICTIONAL-ONLY',LOGIC_WORKSHOP_PROVIDER:provider};
  const workFor=(operationId, refs=[])=>({workId:`WORK-${operationId}`,checkpointId:`CHECK-${operationId}`,ownerDomain:'LOGIC',intent:'LOGIC_WORKSHOP',scope:['EXECUTE:LOGIC'],inputRefs:refs,expectedSourceSha:'LOCAL-SOURCE',actingActor:'GO',source:{system:'METROPOLIS',stationId:'CITY'},target:{system:'FACTORY',stationId:'FACTORY-STATION',component:'FACTORY_HALL'},workPassRef:'work-pass://local',workPass:{kind:'WORK_PASS',version:'WORK_PASS_V1',passId:'local',status:'ACTIVE',workId:`WORK-${operationId}`,checkpointId:`CHECK-${operationId}`,actor:'GO',permissions:{actions:['handoff'],handoff:[{stationId:'FACTORY_STATION'}]}}});
  const send=async body=>{
    const response=await worker.fetch(await railRequest('https://local.invalid/station/receive',{method:'POST',secret:env.METROPOLIS_FACTORY_RAIL_SECRET,body:JSON.stringify(body)}),env);
    return {status:response.status,body:await response.json()};
  };
  const run=async(fields,expect='PASS')=>{
    const command={subjectId:`SUB-${kind}`,operationId:`OP-${++sequence}`,...fields};
    let result;
    if(useWorker){
      const content=await put(command),work=workFor(command.operationId,[content.ref]);
      const response=await send(work);
      result=response.body.readback?.machineResult?.workshopResult;
      assert.ok(result,JSON.stringify(response));
      const repeat=await send(work);
      assert.equal(repeat.body.receipt.receiptId,response.body.receipt.receiptId);
      const readback=await worker.fetch(await railRequest(`https://local.invalid/station/readback/${response.body.receipt.receiptId}`,{secret:env.METROPOLIS_FACTORY_RAIL_SECRET}),env);
      assert.deepEqual(await readback.json(),response.body.readback);
      assert.equal(response.body.readback.machineResult.run.subjectAssessment.status,'NOT_ASSESSED');
      if(expect==='PASS') assert.equal(response.body.readback.domainVerified,true);
      if(command.operation==='EXPORT_PACKAGE'&&expect==='PASS') {
        const delivery=await readWorkshopDelivery(store,response.body.receipt.receiptId);
        assert.deepEqual(delivery.receipt,response.body.receipt);
        assert.deepEqual(delivery.readback,response.body.readback);
        assert.equal(delivery.package.candidate.status,'QUALIFIED');
      }
    } else result=await workshop.execute(command,workFor(command.operationId));
    assert.equal(result.status,expect,JSON.stringify(result)); return result;
  };
  await run({operation:'REGISTER_SUBJECT',kind,ownerSystem:'METROPOLIS',manifestRef:manifest.ref,inputSchemaRef:schema.ref,outputSchemaRef:schema.ref});
  await run({operation:'CAPTURE_BASELINE',baselineId:'B1',initialImportedConfig:true,configRef:config.ref,configSha256:config.sha256,testSuiteRef:suite.ref,testSuiteSha256:suite.sha256,environmentRef:environment.ref});
  const candidate=(versionId, cfg=config,extra={})=>run({operation:'CREATE_CANDIDATE',versionId,baselineId:'B1',configRef:cfg.ref,configSha256:cfg.sha256,changeNote:'synthetic adjustment',...extra});
  const tests=(testRunId,versionId,extra={})=>run({operation:'RUN_TEST_SUITE',testRunId,versionId,baselineId:'B1',suiteRef:suite.ref,suiteSha256:suite.sha256,environmentRef:environment.ref,...extra});
  return {store,workshop,provider,put,run,candidate,tests,config,improved,crashed,suite,environment,workFor,send,env,get calls(){return calls;},set approved(v){approved=v;}};
}

for(const kind of ['AGENT','RUNNER']) test(`${kind}: full synthetic Worker workflow retains failures, RCA lineage, explicit qualification and package receipt`,async()=>{
  const f=await setup(kind,true);
  await f.candidate('V1');
  await f.tests('BASE',null);
  const failed=await f.tests('FAILED','V1');
  assert.equal(failed.output.status,'FAIL');
  await f.run({operation:'RECORD_RCA',rcaId:'RCA1',versionId:'V1',failedTestRunRefs:['FAILED'],hypothesis:'increment missing',proposedAdjustment:'increment by one'});
  await f.candidate('V2',f.improved,{parentVersionId:'V1',rcaId:'RCA1'});
  await f.tests('PASS','V2');
  const comparison=await f.run({operation:'COMPARE_BASELINE',comparisonId:'CMP',baselineTestRunId:'BASE',candidateTestRunId:'PASS'});
  assert.equal(comparison.output.deltas.passed,1);
  f.approved=false;
  const denied=await f.run({operation:'OWNER_QUALIFY',decisionId:'DENIED',versionId:'V2',comparisonId:'CMP'},'FAIL');
  assert.equal(denied.error.code,'OWNER_QUALIFICATION_REQUIRED');
  f.approved=true;
  await f.run({operation:'OWNER_QUALIFY',decisionId:'YES',versionId:'V2',comparisonId:'CMP'});
  const exported=await f.run({operation:'EXPORT_PACKAGE',packageId:'PACKAGE',versionId:'V2',decisionId:'YES'});
  const artifact=await readWorkshopContent(f.store,exported.output.ref,exported.output.sha256);
  assert.equal(artifact.decision.status,'QUALIFIED');
  assert.equal(artifact.candidate.parentVersionId,'V1');
  assert.equal(artifact.productionPublished,false);
  assert.equal(f.calls,3,'receipt replay must not rerun test cases');
  const snapshot=await f.workshop.snapshot(`SUB-${kind}`);
  assert.equal(snapshot.tests.FAILED.status,'FAIL');
  assert.equal(snapshot.versions.V1.configRef,f.config.ref);
  assert.equal(snapshot.baselines.B1.configRef,f.config.ref);
  assert.equal([...f.env.RECORD_STORE.records.keys()].some(k=>k.includes('logic/trainees/')),false);
});

test('different suites/environments cannot qualify or claim improvement; errors retained',async()=>{
  const f=await setup();await f.candidate('V1',f.crashed);await f.tests('BASE',null);
  const error=await f.tests('ERROR','V1');assert.equal(error.output.status,'ERROR');
  assert.equal(JSON.stringify(error).includes('DO_NOT_LEAK'),false);
  const other=await f.put({runtime:'different'});
  await f.candidate('V2',f.improved);await f.tests('OTHER','V2',{environmentRef:other.ref});
  const compared=await f.run({operation:'COMPARE_BASELINE',comparisonId:'NO',baselineTestRunId:'BASE',candidateTestRunId:'OTHER'});
  assert.equal(compared.output.status,'NOT_COMPARABLE');assert.equal(compared.output.deltas,null);
  await f.run({operation:'OWNER_QUALIFY',decisionId:'NO',versionId:'V2',comparisonId:'NO'},'FAIL');
});

test('immutable IDs, digests, lineage and content checks reject conflicting changes',async()=>{
  const f=await setup();await f.candidate('V1');
  await f.candidate('V2',f.improved,{parentVersionId:'V1'});
  const duplicate=await f.run({operation:'CREATE_CANDIDATE',versionId:'V1',baselineId:'B1',configRef:f.improved.ref,configSha256:f.improved.sha256,changeNote:'overwrite'},'FAIL');
  assert.equal(duplicate.error.code,'versionId_EXISTS');
  await f.run({operation:'CREATE_CANDIDATE',versionId:'BAD',baselineId:'B1',parentVersionId:'MISSING',configRef:f.config.ref,configSha256:f.config.sha256,changeNote:'bad'},'FAIL');
  await f.run({operation:'CREATE_CANDIDATE',versionId:'BAD2',baselineId:'B1',configRef:f.config.ref,configSha256:'f'.repeat(64),changeNote:'bad'},'FAIL');
  await assert.rejects(f.put({apiKey:'never store'}),/INLINE_SECRET/);
  const c={operation:'CREATE_CANDIDATE',operationId:'REPLAY',subjectId:'SUB-AGENT',versionId:'V3',baselineId:'B1',configRef:f.config.ref,configSha256:f.config.sha256,changeNote:'same'};
  const first=await f.workshop.execute(c,f.workFor('REPLAY'));
  assert.deepEqual(await f.workshop.execute(c,f.workFor('REPLAY')),first);
  await assert.rejects(f.workshop.execute({...c,changeNote:'changed'},f.workFor('REPLAY')),/REPLAY_CONFLICT/);
  await assert.rejects(f.workshop.execute(c,{...f.workFor('REPLAY'),scope:[]}),/SCOPE_DENIED/);
});

test('suite mismatch, immutable baseline, and rejected version block export',async()=>{
  const f=await setup();await f.candidate('V1',f.improved);await f.tests('BASE',null);
  const changed=await f.put({cases:[{caseId:'other',inputRef:(await f.put({value:1})).ref,expectedRef:(await f.put(2)).ref}]});
  await f.tests('CHANGED','V1',{suiteRef:changed.ref,suiteSha256:changed.sha256});
  const comparison=await f.run({operation:'COMPARE_BASELINE',comparisonId:'CMP',baselineTestRunId:'BASE',candidateTestRunId:'CHANGED'});
  assert.equal(comparison.output.status,'NOT_COMPARABLE');
  await f.run({operation:'CAPTURE_BASELINE',baselineId:'B1'},'FAIL');
  assert.equal((await f.workshop.snapshot('SUB-AGENT')).baselines.B1.configRef,f.config.ref);
  const original=f.provider.authorize;
  f.provider.authorize=async input=>({...await original(input),qualificationApproved:false});
  await f.run({operation:'OWNER_QUALIFY',decision:'REJECTED',decisionId:'NO',versionId:'V1',comparisonId:'CMP'});
  assert.equal((await f.workshop.snapshot('SUB-AGENT')).versionStates.V1,'REJECTED');
  await f.run({operation:'EXPORT_PACKAGE',packageId:'NO',versionId:'V1',decisionId:'NO'},'FAIL');
});

test('wrong authority and unapproved test inputs cause no mutation or executor calls',async()=>{
  const f=await setup();await f.candidate('V1');
  const before=await f.workshop.snapshot('SUB-AGENT');
  const command={operation:'RUN_TEST_SUITE',operationId:'DENY',subjectId:'SUB-AGENT',testRunId:'DENY',versionId:'V1',baselineId:'B1',suiteRef:f.suite.ref,suiteSha256:f.suite.sha256,environmentRef:f.environment.ref};
  const original=f.provider.authorize;
  f.provider.authorize=async input=>({...await original(input),actor:'OTHER'});
  await assert.rejects(f.workshop.execute(command,f.workFor('DENY')),/AUTHORITY_DENIED/);
  f.provider.authorize=async input=>({...await original(input),testInputsApproved:false});
  await assert.rejects(f.workshop.execute(command,f.workFor('DENY')),/INPUTS_NOT_APPROVED/);
  assert.equal(f.calls,0);assert.deepEqual(await f.workshop.snapshot('SUB-AGENT'),before);
});

test('uncertain final persistence leaves a claim and never repeats case execution',async()=>{
  const f=await setup();await f.candidate('V1');
  let invoked=0, puts=0;
  const uncertain={...f.store,put:async(...args)=>{if(args[0].includes('/subjects/')) puts++;if(args[0].includes('/subjects/')&&args[1].pending===null)throw Error('LOCAL_LOST_WRITE');return f.store.put(...args);}};
  const workshop=createLogicWorkshop({store:uncertain,provider:{...f.provider,runCase:async()=>{invoked++;return 2;}}});
  const command={operation:'RUN_TEST_SUITE',operationId:'UNCERTAIN',subjectId:'SUB-AGENT',testRunId:'UNCERTAIN',versionId:'V1',baselineId:'B1',suiteRef:f.suite.ref,suiteSha256:f.suite.sha256,environmentRef:f.environment.ref};
  await assert.rejects(workshop.execute(command,f.workFor('UNCERTAIN')),/LOCAL_LOST_WRITE/);
  await assert.rejects(workshop.execute(command,f.workFor('UNCERTAIN')),/EFFECT_UNRECONCILED/);
  assert.equal(invoked,1);
  assert.equal((await f.workshop.snapshot('SUB-AGENT')).tests.UNCERTAIN.status,'UNKNOWN');
});

test('content corruption and empty suites cannot fabricate test evidence',async()=>{
  const f=await setup();await f.candidate('V1');
  const empty=await f.put({cases:[]});
  await f.run({operation:'RUN_TEST_SUITE',testRunId:'EMPTY',versionId:'V1',baselineId:'B1',suiteRef:empty.ref,suiteSha256:empty.sha256,environmentRef:f.environment.ref},'FAIL');
  const key=f.config.ref.slice('r2://factory/records/'.length), record=await f.store.get(key);
  await f.store.put(key,{...record.value,content:{increment:999}},{expectedVersion:record.version});
  await assert.rejects(readWorkshopContent(f.store,f.config.ref),/DIGEST_MISMATCH/);
  assert.equal(f.calls,0);
});

test('Worker rejects wrong scope, conflicting Work replay, and missing provider without DWARF fallback',async()=>{
  const f=await setup('AGENT',true);
  const before=await f.workshop.snapshot('SUB-AGENT');
  const command={operation:'CREATE_CANDIDATE',operationId:'SCOPED',subjectId:'SUB-AGENT',versionId:'SCOPED',baselineId:'B1',configRef:f.config.ref,configSha256:f.config.sha256,changeNote:'scoped'};
  const stored=await f.put(command), work=f.workFor('SCOPED',[stored.ref]);
  const denied=await f.send({...work,scope:['READ:LOGIC']});
  assert.equal(denied.status,403);
  assert.equal(denied.body.receipt.reason,'SCOPE_NOT_GRANTED');
  assert.deepEqual(await f.workshop.snapshot('SUB-AGENT'),before);
  const conflict=await f.send(work);
  assert.equal(conflict.status,409);
  assert.equal(f.calls,0);
  assert.equal([...f.env.RECORD_STORE.records.keys()].some(k=>k.includes('logic/trainees/')),false);
  const health=await (await worker.fetch(new Request('https://local.invalid/health'),f.env)).json();
  assert.equal(health.machinery.LOGIC.genericRunner.status,'READY');
  delete f.env.LOGIC_WORKSHOP_PROVIDER;
  const missing=await f.send(f.workFor('MISSING',[stored.ref]));
  assert.equal(missing.status,409);
  assert.equal(missing.body.receipt.reason,'LOGIC_RUNNER_NOT_CONFIGURED');
});

test('concurrent operation claims execute test cases once',async()=>{
  const f=await setup();await f.candidate('V1');
  const command={operation:'RUN_TEST_SUITE',operationId:'CONCURRENT',subjectId:'SUB-AGENT',testRunId:'CONCURRENT',versionId:'V1',baselineId:'B1',suiteRef:f.suite.ref,suiteSha256:f.suite.sha256,environmentRef:f.environment.ref};
  const outcomes=await Promise.allSettled([f.workshop.execute(command,f.workFor('CONCURRENT')),f.workshop.execute(command,f.workFor('CONCURRENT'))]);
  assert.ok(outcomes.some(x=>x.status==='fulfilled'));
  assert.equal(f.calls,1);
  const result=await f.workshop.execute(command,f.workFor('CONCURRENT'));
  assert.equal(result.output.status,'FAIL');
  assert.equal(f.calls,1);
});
