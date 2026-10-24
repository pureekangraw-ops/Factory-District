import test from 'node:test';
import assert from 'node:assert/strict';
import { directWorkshopFixture, exerciseWorkshop } from './support/workshop-direct-fixture.mjs';
import { createR2RecordStore } from '../src/r2-record-store.mjs';
import { readWorkshopContent } from '../src/logic-workshop.mjs';

for(const kind of ['AGENT','RUNNER']) test(`signed GO ${kind} lifecycle executes real bounded provider, retains failures and verifies package`,async()=>{
  const f=directWorkshopFixture(), result=await exerciseWorkshop(f.client,kind);
  const testRun=result.delivery.package.tests.find(t=>t.testRunId==='PASSED');
  const evidence=await readWorkshopContent(createR2RecordStore(f.bucket),testRun.caseResults[0].evidenceRefs[0]);
  assert.equal(evidence.actual,kind==='AGENT'?'high':4);
  assert.equal(evidence.expected,evidence.actual);
  assert.equal([...f.bucket.records.keys()].some(k=>k.includes('logic/trainees/')),false);
});

test('Workshop content rejects City principal, inline credentials and stale source',async()=>{
  const f=directWorkshopFixture();
  assert.equal((await f.call('/station/go-workshop-content',{content:{x:1},expectedSourceSha:f.env.SOURCE_SHA},'CITY')).status,403);
  const secret=await f.call('/station/go-workshop-content',{content:{apiKey:'fictional'},expectedSourceSha:f.env.SOURCE_SHA});assert.equal(secret.status,400);
  assert.equal((await f.call('/station/go-workshop-content',{content:{x:1},expectedSourceSha:'b'.repeat(40)})).status,400);
  assert.equal(f.bucket.records.size,0);
});

test('caller cannot forge provider authorization without Factory signed-command grant',async()=>{
  const f=directWorkshopFixture();
  const grant=await f.provider.authorize({command:{operation:'OWNER_QUALIFY',ownerDecisionRef:'forged'},work:{workId:'GOJOB-'+'a'.repeat(32)},ownerSystem:'go-together'});
  assert.equal(grant.allowed,false);assert.equal(f.bucket.records.size,0);
});

test('changed request cannot overwrite grant or execute and arbitrary content cannot be downloaded',async()=>{
  const f=directWorkshopFixture(), requestId=crypto.randomUUID();
  const command={operation:'CREATE_CANDIDATE',operationId:'MISSING',subjectId:'MISSING'};
  const first=await f.client.submit(command,requestId);assert.equal(first.ok,false);
  const changed=await f.client.submit({...command,subjectId:'OTHER'},requestId);
  assert.equal(changed.reason,'GO_WORKSHOP_REQUEST_CONFLICT');
  const content=await f.client.put({private:'fixture'});
  const download=await f.call('/station/go-artifact',{receiptId:first.receiptId,artifactRef:content.ref});
  assert.equal(download.status,403);
});

for(const kind of ['AGENT','RUNNER']) test(`${kind} bounded execution rejects arbitrary-code adapter and retains ERROR`,async()=>{
  const f=directWorkshopFixture(), flow=await exerciseWorkshop(f.client,kind);
  const config=await f.client.put({adapter:'EVAL',source:'globalThis.WORKSHOP_EVAL_RAN=true'}),baseline=flow.delivery.package.baseline;
  const command={subjectId:`DIRECT-${kind}`,operationId:'NEGATIVE-CANDIDATE',operation:'CREATE_CANDIDATE',versionId:'UNSUPPORTED',baselineId:'B1',configRef:config.ref,configSha256:config.sha256,changeNote:'unsupported must fail in executor'};
  assert.equal((await f.client.submit(command)).ok,true);
  const result=await f.client.submit({subjectId:`DIRECT-${kind}`,operationId:'NEGATIVE-TEST',operation:'RUN_TEST_SUITE',testRunId:'UNSUPPORTED',versionId:'UNSUPPORTED',baselineId:'B1',suiteRef:baseline.testSuiteRef,suiteSha256:baseline.testSuiteSha256,environmentRef:baseline.environmentRef});
  assert.equal(result.ok,true);assert.equal(result.workshopResult.output.status,'ERROR');
  assert.equal(globalThis.WORKSHOP_EVAL_RAN,undefined);
});

test('owner decision requires explicit decision and reference before any grant is persisted',async()=>{
  const f=directWorkshopFixture();
  const result=await f.client.submit({operation:'OWNER_QUALIFY',operationId:'NO-DECISION',subjectId:'NONE',versionId:'V1',comparisonId:'CMP'});
  assert.equal(result.ok,false);assert.equal(result.reason,'GO_WORKSHOP_OWNER_DECISION_REQUIRED');
  assert.equal(f.bucket.records.size,0);
});
