import { assertWorkshopSchema, matchesWorkshopSchema, requireWorkshopSchema } from './workshop-schema.mjs';
import { assertDurableStore } from './durable-store.mjs';

export const WORKSHOP_REVISION = 'LOGIC_WORKSHOP_V0_1';
export const WORKSHOP_OPERATIONS = Object.freeze(['REGISTER_SUBJECT','CAPTURE_BASELINE','CREATE_CANDIDATE','RUN_TEST_SUITE','COMPARE_BASELINE','RECORD_RCA','OWNER_QUALIFY','EXPORT_PACKAGE']);
const prefix = 'logic/workshop/v1/';
const ref = key => `r2://factory/records/${key}`;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = (v, name) => typeof v === 'string' && v.trim() ? v : fail(`${name}_REQUIRED`);
const id = (v, name) => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(text(v,name)) && !['__proto__','constructor','prototype'].includes(v) ? v : fail(`${name}_INVALID`);
const canonical = value => {
  if (value === null) return 'null';
  if (typeof value !== 'object') {
    if (!['string','number','boolean'].includes(typeof value) || (typeof value==='number'&&!Number.isFinite(value))) fail('WORKSHOP_JSON_REQUIRED');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
export async function workshopHash(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  if (bytes.length > 262144) fail('WORKSHOP_CONTENT_TOO_LARGE');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function noSecrets(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key,item] of Object.entries(value)) {
    if (/^(secret|password|token|apiKey|authorization|credentials)$/i.test(key)) fail('WORKSHOP_INLINE_SECRET_FORBIDDEN');
    noSecrets(item);
  }
}
export async function putWorkshopContent(store, value) {
  noSecrets(value);
  const hash = await workshopHash(value), key = `${prefix}content/${hash}`;
  const existing = await store.get(key);
  if (!existing) {
    try { await store.put(key, { hash, content: value }, { expectedVersion: 0 }); }
    catch (error) { if (error.message !== 'DURABLE_CONFLICT') throw error; }
  }
  await readWorkshopContent(store, ref(key));
  return { ref: ref(key), sha256: hash };
}
export async function readWorkshopContent(store, contentRef, expectedHash) {
  const match = typeof contentRef === 'string' && contentRef.match(/^r2:\/\/factory\/records\/logic\/workshop\/v1\/content\/([a-f0-9]{64})$/);
  if (!match || (expectedHash !== undefined && expectedHash !== match[1])) fail('WORKSHOP_CONTENT_REF_INVALID');
  const record = await store.get(`${prefix}content/${match[1]}`);
  if (!record || record.value.hash !== match[1] || await workshopHash(record.value.content) !== match[1]) fail('WORKSHOP_CONTENT_DIGEST_MISMATCH');
  return structuredClone(record.value.content);
}

// Required configuration refs are immutable Workshop content. Tool/provider/model
// identities are names only: validate their shape, never fetch them as content.
async function validateSubjectContent(store, subject) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const load = r => readWorkshopContent(store,r);
  const schema = async r => assertWorkshopSchema(await load(r));
  const storedObject = async r => { if(!object(await load(r))) fail('MANIFEST_CONTENT_SHAPE_INVALID'); };
  const identity = async (r, schemes) => {
    text(r,'identityRef');
    if(r.startsWith('r2://')) { await load(r); return; }
    const match=r.match(/^([a-z]+):\/\/([A-Za-z0-9_.:/-]+)$/);
    if(!match||!schemes.includes(match[1])) fail('MANIFEST_IDENTITY_REF_INVALID');
  };
  const refs = async (values, schemes) => {
    if(!Array.isArray(values)) fail('MANIFEST_REFS_ARRAY_REQUIRED');
    for(const r of values) await identity(r,schemes);
  };
  const manifest=await load(subject.manifestRef);
  if(!object(manifest)) fail('MANIFEST_OBJECT_REQUIRED');
  await schema(subject.inputSchemaRef); await schema(subject.outputSchemaRef);
  if(subject.kind==='AGENT') {
    text(manifest.role,'manifest.role');
    const prompt=await load(manifest.promptRef);
    if(!(typeof prompt==='string'&&prompt.trim())&&!object(prompt)) fail('MANIFEST_PROMPT_INVALID');
    await refs(manifest.toolCapabilityRefs,['capability','tool']);
    await storedObject(manifest.policyRef); await storedObject(manifest.authorityRef);
    if(manifest.providerRef!==undefined) await identity(manifest.providerRef,['provider']);
    if(manifest.modelRef!==undefined) await identity(manifest.modelRef,['model']);
  } else if(subject.kind==='RUNNER') {
    await storedObject(manifest.workflowGraphRef);
    await refs(manifest.toolRefs,['tool','capability']);
    for(const field of ['timeoutPolicyRef','retryPolicyRef','idempotencyPolicyRef','recoveryPolicyRef']) await storedObject(manifest[field]);
    if(!Array.isArray(manifest.stepContracts)) fail('MANIFEST_STEP_CONTRACTS_INVALID');
    const seen=new Set();
    for(const step of manifest.stepContracts) {
      if(!object(step)) fail('MANIFEST_STEP_CONTRACT_INVALID');
      id(step.stepId,'stepId'); if(seen.has(step.stepId)) fail('MANIFEST_DUPLICATE_STEP'); seen.add(step.stepId);
      await schema(step.inputSchemaRef); await schema(step.outputSchemaRef);
      if(step.toolRef!==undefined) await identity(step.toolRef,['tool','capability']);
    }
  } else fail('WORKSHOP_SUBJECT_KIND_INVALID');
  return manifest;
}

async function completeTestEvidence(store, run, subject) {
  try {
    if(!run||!['PASS','FAIL'].includes(run.status)) return false;
    const inputSchema=assertWorkshopSchema(await readWorkshopContent(store,subject.inputSchemaRef));
    const outputSchema=assertWorkshopSchema(await readWorkshopContent(store,subject.outputSchemaRef));
    const suite=await readWorkshopContent(store,run.suiteRef,run.suiteSha256);
    await readWorkshopContent(store,run.environmentRef);
    if(!Array.isArray(suite.cases)||!suite.cases.length||suite.cases.length>64
      ||!Array.isArray(run.caseResults)||run.caseResults.length!==suite.cases.length) return false;
    const ids=new Set(suite.cases.map(c=>c.caseId));
    if(ids.size!==suite.cases.length||new Set(run.caseResults.map(c=>c.caseId)).size!==ids.size) return false;
    let passed=0; const evidence=[];
    for(const item of suite.cases) {
      const result=run.caseResults.find(r=>r.caseId===item.caseId);
      if(!result||!['PASS','FAIL'].includes(result.status)||result.evidenceRefs?.length!==1) return false;
      const proof=await readWorkshopContent(store,result.evidenceRefs[0]);
      const expected=await readWorkshopContent(store,item.expectedRef);
      const input=await readWorkshopContent(store,item.inputRef);
      if(!matchesWorkshopSchema(inputSchema,input)||!matchesWorkshopSchema(outputSchema,expected)||!matchesWorkshopSchema(outputSchema,proof.actual)) return false;
      if(proof.caseId!==item.caseId||canonical(proof.expected)!==canonical(expected)) return false;
      const status=canonical(proof.actual)===canonical(expected)?'PASS':'FAIL';
      if(result.status!==status) return false;
      if(status==='PASS') passed++;
      evidence.push(...result.evidenceRefs);
    }
    return run.metrics?.total===ids.size&&run.metrics?.passed===passed
      &&run.status===(passed===ids.size?'PASS':'FAIL')
      &&canonical(run.evidenceRefs)===canonical(evidence);
  } catch { return false; }
}

// One CAS aggregate per subject preserves cross-entity integrity and serializes
// effects. A reserved operation is never blindly replayed after an uncertain write.
export function createLogicWorkshop({ store, provider, clock = () => new Date().toISOString() }) {
  assertDurableStore(store);
  if (typeof provider?.authorize !== 'function' || typeof provider?.runCase !== 'function') fail('WORKSHOP_PROVIDER_REQUIRED');
  const subjectKey = subjectId => `${prefix}subjects/${id(subjectId,'subjectId')}`;
  function latestDecision(state, versionId) {
    const decision=state.decisions[state.latestDecisionIds?.[versionId]];
    return decision?.versionId===versionId&&Number.isSafeInteger(decision.sequence)&&decision.sequence>0?decision:null;
  }
  async function qualificationEvidence(state, comparison, versionId) {
    if(comparison.versionId!==versionId||comparison.baselineTestRunIds?.length!==1||comparison.candidateTestRunIds?.length!==1) return false;
    const a=state.tests[comparison.baselineTestRunIds[0]],b=state.tests[comparison.candidateTestRunIds[0]];
    if(!a||!b||a.versionId!==null||b.versionId!==versionId||a.baselineId!==b.baselineId||b.status!=='PASS'
      ||a.suiteSha256!==b.suiteSha256||a.environmentRef!==b.environmentRef) return false;
    return await completeTestEvidence(store,a,state.subject)&&await completeTestEvidence(store,b,state.subject);
  }
  function versionState(state, versionId) {
    const decision=latestDecision(state,versionId);
    if(!decision&&Object.values(state.decisions).some(d=>d.versionId===versionId)) return 'UNKNOWN';
    return decision?.status || (Object.values(state.tests).some(t=>t.versionId===versionId)?'TESTED':'DRAFT');
  }
  async function snapshot(subjectId) {
    const state=(await store.get(subjectKey(subjectId)))?.value || null;
    if(state) state.versionStates=Object.fromEntries(Object.keys(state.versions).map(v=>[v,versionState(state,v)]));
    return state;
  }
  async function execute(command, work) {
    const c = structuredClone(command);
    if (!WORKSHOP_OPERATIONS.includes(c.operation)) fail('WORKSHOP_OPERATION_UNSUPPORTED');
    id(c.operationId,'operationId'); id(c.subjectId,'subjectId');
    if (work?.ownerDomain !== 'LOGIC' || work.intent !== 'LOGIC_WORKSHOP' || !work.scope?.includes('EXECUTE:LOGIC')) fail('WORKSHOP_SCOPE_DENIED');
    const key = subjectKey(c.subjectId), record = await store.get(key);
    const state = record?.value || { revision: WORKSHOP_REVISION, subject: null, baselines: {}, versions: {}, tests: {}, comparisons: {}, rcas: {}, decisions: {}, decisionSequence: 0, latestDecisionIds: {}, packages: {}, operations: {}, pending: null };
    let grant;
    try { grant = await provider.authorize({ command: c, work, ownerSystem: state.subject?.ownerSystem || c.ownerSystem }); }
    catch { fail('WORKSHOP_AUTHORIZATION_UNAVAILABLE'); }
    if (grant?.allowed !== true || grant.subjectId !== c.subjectId || grant.operation !== c.operation
      || grant.operationId !== c.operationId || grant.actor !== work.actingActor
      || grant.ownerSystem !== (state.subject?.ownerSystem || c.ownerSystem)) fail('WORKSHOP_AUTHORITY_DENIED');
    if (c.operation === 'RUN_TEST_SUITE' && grant.testInputsApproved !== true) fail('WORKSHOP_TEST_INPUTS_NOT_APPROVED');
    const digest = await workshopHash({ command: c, workId: work.workId, checkpointId: work.checkpointId, actor: work.actingActor });
    const prior = state.operations[c.operationId];
    if (prior) {
      if (prior.digest !== digest) fail('WORKSHOP_REPLAY_CONFLICT');
      if (!prior.result) fail('WORKSHOP_EFFECT_UNRECONCILED');
      return structuredClone(prior.result);
    }
    if (state.pending) fail('WORKSHOP_EFFECT_UNRECONCILED');
    if (c.operation !== 'REGISTER_SUBJECT' && !state.subject) fail('WORKSHOP_SUBJECT_NOT_FOUND');
    state.pending = c.operationId;
    state.operations[c.operationId] = { digest, workId: work.workId, checkpointId: work.checkpointId, actor: work.actingActor };
    let reserved = await store.put(key,state,{ expectedVersion: record?.version || 0 });
    const at = clock();
    const entity = (map, value, label) => map[id(value,label)] || fail(`${label}_NOT_FOUND`);
    const fresh = (map, value, label) => { id(value,label); if (map[value]) fail(`${label}_EXISTS`); };
    const content = (r,h) => readWorkshopContent(store,r,h);
    const digestRequired = h => /^[a-f0-9]{64}$/.test(h) ? h : fail('WORKSHOP_DIGEST_REQUIRED');
    const version = versionId => entity(state.versions,versionId,'versionId');
    const baseline = baselineId => entity(state.baselines,baselineId,'baselineId');
    let output, error;
    try {
      switch(c.operation) {
        case 'REGISTER_SUBJECT': {
          if (state.subject) fail('WORKSHOP_SUBJECT_EXISTS');
          if (!['AGENT','RUNNER'].includes(c.kind)) fail('WORKSHOP_SUBJECT_KIND_INVALID');
          text(c.ownerSystem,'ownerSystem');
          await validateSubjectContent(store,c);
          state.subject = { subjectId:c.subjectId,kind:c.kind,ownerSystem:c.ownerSystem,manifestRef:c.manifestRef,inputSchemaRef:c.inputSchemaRef,outputSchemaRef:c.outputSchemaRef,createdAt:at };
          output = state.subject; break;
        }
        case 'CAPTURE_BASELINE': {
          fresh(state.baselines,c.baselineId,'baselineId');
          const config = await content(c.configRef,digestRequired(c.configSha256));
          await content(c.testSuiteRef,digestRequired(c.testSuiteSha256)); await content(c.environmentRef);
          if (c.sourceVersionId) { const source=version(c.sourceVersionId); if(source.configRef!==c.configRef) fail('BASELINE_SOURCE_CONFIG_MISMATCH'); }
          else if (c.initialImportedConfig !== true) fail('BASELINE_SOURCE_REQUIRED');
          if (!config || typeof config !== 'object') fail('CONFIG_INVALID');
          output = state.baselines[c.baselineId] = { baselineId:c.baselineId,subjectId:c.subjectId,sourceVersionId:c.sourceVersionId || null,initialImportedConfig:!c.sourceVersionId,configRef:c.configRef,configSha256:await workshopHash(config),testSuiteRef:c.testSuiteRef,testSuiteSha256:c.testSuiteSha256,environmentRef:c.environmentRef,createdAt:at };
          break;
        }
        case 'CREATE_CANDIDATE': {
          fresh(state.versions,c.versionId,'versionId'); const b=baseline(c.baselineId);
          if(c.parentVersionId && version(c.parentVersionId).baselineId!==b.baselineId) fail('PARENT_BASELINE_MISMATCH');
          if(c.rcaId) { const r=entity(state.rcas,c.rcaId,'rcaId'); if(r.versionId!==c.parentVersionId) fail('RCA_PARENT_MISMATCH'); }
          await content(c.configRef,digestRequired(c.configSha256));
          text(c.changeNote,'changeNote');
          output=state.versions[c.versionId]={versionId:c.versionId,subjectId:c.subjectId,baselineId:b.baselineId,parentVersionId:c.parentVersionId||null,rcaId:c.rcaId||null,configRef:c.configRef,configSha256:c.configSha256,changeNote:c.changeNote,createdAt:at,status:'DRAFT'}; break;
        }
        case 'RUN_TEST_SUITE': {
          await validateSubjectContent(store,state.subject);
          fresh(state.tests,c.testRunId,'testRunId'); const b=baseline(c.baselineId);
          const v=c.versionId===null ? null : version(c.versionId);
          if(v && v.baselineId!==b.baselineId) fail('TEST_BASELINE_MISMATCH');
          if(!v && (c.suiteRef!==b.testSuiteRef || c.suiteSha256!==b.testSuiteSha256 || c.environmentRef!==b.environmentRef)) fail('BASELINE_TEST_CONTEXT_MISMATCH');
          const suite=await content(c.suiteRef,digestRequired(c.suiteSha256)); await content(c.environmentRef);
          if(!Array.isArray(suite.cases)||suite.cases.length<1||suite.cases.length>64||new Set(suite.cases.map(x=>x.caseId)).size!==suite.cases.length) fail('TEST_SUITE_INVALID');
          const config=await content(v?.configRef||b.configRef,v?.configSha256||b.configSha256);
          const inputSchema=await content(state.subject.inputSchemaRef),outputSchema=await content(state.subject.outputSchemaRef);
          const prepared=[];
          for(const item of suite.cases) { id(item.caseId,'caseId'); prepared.push({caseId:item.caseId,input:await content(item.inputRef),expected:await content(item.expectedRef)}); }
          state.tests[c.testRunId]={testRunId:c.testRunId,subjectId:c.subjectId,versionId:v?.versionId||null,baselineId:b.baselineId,suiteRef:c.suiteRef,suiteSha256:c.suiteSha256,environmentRef:c.environmentRef,caseResults:[],metrics:{total:prepared.length,passed:0},evidenceRefs:[],status:'UNKNOWN',observedAt:at};
          reserved=await store.put(key,state,{expectedVersion:reserved.version});
          const results=[];
          for(const item of prepared) {
            try {
              requireWorkshopSchema(inputSchema,item.input,'INPUT');
              requireWorkshopSchema(outputSchema,item.expected,'EXPECTED_OUTPUT');
              const actual=await provider.runCase({ subject:state.subject,config,environmentRef:c.environmentRef,caseId:item.caseId,input:item.input,work });
              requireWorkshopSchema(outputSchema,actual,'OUTPUT');
              const evidence=await putWorkshopContent(store,{caseId:item.caseId,actual,expected:item.expected});
              results.push({caseId:item.caseId,status:canonical(actual)===canonical(item.expected)?'PASS':'FAIL',evidenceRefs:[evidence.ref]});
            } catch(error) {
              const reason=['WORKSHOP_INPUT_SCHEMA_MISMATCH','WORKSHOP_EXPECTED_OUTPUT_SCHEMA_MISMATCH','WORKSHOP_OUTPUT_SCHEMA_MISMATCH'].includes(error.code)?error.code:'WORKSHOP_CASE_ERROR';
              const evidence=await putWorkshopContent(store,{caseId:item.caseId,status:'ERROR',reason});
              results.push({caseId:item.caseId,status:'ERROR',evidenceRefs:[evidence.ref],reason});
            }
          }
          const status=results.some(x=>x.status==='ERROR')?'ERROR':results.every(x=>x.status==='PASS')?'PASS':'FAIL';
          output=state.tests[c.testRunId]={testRunId:c.testRunId,subjectId:c.subjectId,versionId:v?.versionId||null,baselineId:b.baselineId,suiteRef:c.suiteRef,suiteSha256:c.suiteSha256,environmentRef:c.environmentRef,caseResults:results,metrics:{total:results.length,passed:results.filter(x=>x.status==='PASS').length},evidenceRefs:results.flatMap(x=>x.evidenceRefs),status,observedAt:at}; break;
        }
        case 'COMPARE_BASELINE': {
          fresh(state.comparisons,c.comparisonId,'comparisonId');
          const a=entity(state.tests,c.baselineTestRunId,'baselineTestRunId'), b=entity(state.tests,c.candidateTestRunId,'candidateTestRunId');
          if(a.versionId!==null || b.versionId===null || a.baselineId!==b.baselineId) fail('COMPARISON_LINEAGE_MISMATCH');
          const sameContext=a.suiteSha256===b.suiteSha256 && a.environmentRef===b.environmentRef;
          const completeEvidence=await completeTestEvidence(store,a,state.subject)&&await completeTestEvidence(store,b,state.subject);
          const comparable=sameContext&&completeEvidence;
          output=state.comparisons[c.comparisonId]={comparisonId:c.comparisonId,subjectId:c.subjectId,versionId:b.versionId,baselineTestRunIds:[a.testRunId],candidateTestRunIds:[b.testRunId],comparableSuiteAndEnv:sameContext,completeEvidence,status:!sameContext?'NOT_COMPARABLE':completeEvidence?'COMPARED':'INCOMPLETE_EVIDENCE',deltas:comparable?{passed:b.metrics.passed-a.metrics.passed}:null,regressions:comparable?a.caseResults.filter(x=>x.status==='PASS'&&b.caseResults.find(y=>y.caseId===x.caseId)?.status!=='PASS').map(x=>x.caseId):null,evidenceRefs:[...a.evidenceRefs,...b.evidenceRefs],createdAt:at}; break;
        }
        case 'RECORD_RCA': {
          fresh(state.rcas,c.rcaId,'rcaId'); version(c.versionId);
          if(!Array.isArray(c.failedTestRunRefs)||!c.failedTestRunRefs.length) fail('RCA_FAILURE_REQUIRED');
          for(const testId of c.failedTestRunRefs) { const t=entity(state.tests,testId,'testRunId'); if(t.versionId!==c.versionId||t.status==='PASS') fail('RCA_FAILURE_MISMATCH'); }
          output=state.rcas[c.rcaId]={rcaId:c.rcaId,subjectId:c.subjectId,versionId:c.versionId,failedTestRunRefs:c.failedTestRunRefs,hypothesis:text(c.hypothesis,'hypothesis'),proposedAdjustment:text(c.proposedAdjustment,'proposedAdjustment'),actor:grant.actor,createdAt:at}; break;
        }
        case 'OWNER_QUALIFY': {
          fresh(state.decisions,c.decisionId,'decisionId'); const v=version(c.versionId), comparison=entity(state.comparisons,c.comparisonId,'comparisonId');
          const decision=c.decision || 'QUALIFIED';
          if(!['QUALIFIED','REJECTED'].includes(decision)||!grant.ownerDecisionRef || grant.qualificationApproved!==(decision==='QUALIFIED')) fail('OWNER_QUALIFICATION_REQUIRED');
          if(comparison.versionId!==v.versionId || (decision==='QUALIFIED' && !await qualificationEvidence(state,comparison,v.versionId))) fail('QUALIFICATION_TESTS_REQUIRED');
          await validateSubjectContent(store,state.subject);
          if(!Number.isSafeInteger(state.decisionSequence)||state.decisionSequence<0||state.decisionSequence>=Number.MAX_SAFE_INTEGER||!state.latestDecisionIds) fail('DECISION_ORDER_UNVERIFIED');
          const sequence=state.decisionSequence+1;
          output=state.decisions[c.decisionId]={decisionId:c.decisionId,sequence,subjectId:c.subjectId,versionId:v.versionId,comparisonId:c.comparisonId,status:decision,actor:grant.actor,ownerDecisionRef:text(grant.ownerDecisionRef,'ownerDecisionRef'),createdAt:at};
          state.decisionSequence=sequence; state.latestDecisionIds[v.versionId]=c.decisionId; break;
        }
        case 'EXPORT_PACKAGE': {
          fresh(state.packages,c.packageId,'packageId'); const v=version(c.versionId), decision=entity(state.decisions,c.decisionId,'decisionId');
          if(decision.versionId!==v.versionId || decision.status!=='QUALIFIED' || versionState(state,v.versionId)!=='QUALIFIED' || latestDecision(state,v.versionId)?.decisionId!==decision.decisionId) fail('PACKAGE_DECISION_MISMATCH');
          await validateSubjectContent(store,state.subject);
          if(!await qualificationEvidence(state,state.comparisons[decision.comparisonId],v.versionId)) fail('QUALIFICATION_TESTS_REQUIRED');
          const payload={revision:WORKSHOP_REVISION,subject:state.subject,manifest:await content(state.subject.manifestRef),config:await content(v.configRef,v.configSha256),candidate:{...v,status:versionState(state,v.versionId)},baseline:baseline(v.baselineId),tests:Object.values(state.tests).filter(t=>t.baselineId===v.baselineId&&(t.versionId===null||t.versionId===v.versionId)),comparison:state.comparisons[decision.comparisonId],decision,workId:work.workId,checkpointId:work.checkpointId,receiptBinding:'OUTER_FACTORY_RECEIPT_AND_READBACK',productionPublished:false};
          const artifact=await putWorkshopContent(store,payload);
          output=state.packages[c.packageId]={packageId:c.packageId,versionId:v.versionId,...artifact}; break;
        }
      }
    } catch(cause) { error={code: cause.code || 'WORKSHOP_OPERATION_FAILED'}; }
    const result={status:error?'FAIL':'PASS',operation:c.operation,operationId:c.operationId,subjectId:c.subjectId,output:output||null,error:error||null,evidenceRef:`${ref(key)}#operations/${c.operationId}`,observedAt:at};
    state.operations[c.operationId].result=result; state.pending=null;
    await store.put(key,state,{expectedVersion:reserved.version});
    const readback=await snapshot(c.subjectId);
    if(canonical(readback?.operations[c.operationId]?.result)!==canonical(result)) fail('WORKSHOP_READBACK_MISMATCH');
    return result;
  }
  return Object.freeze({execute,snapshot});
}

// Internal storage helper, not a new public route. Callers retain their existing
// receipt authorization. The delivery envelope avoids a circular artifact hash:
// immutable package first, then its exact persisted Factory receipt/readback.
export async function readWorkshopDelivery(store, receiptId) {
  if (!/^receipt-[A-Za-z0-9-]+$/.test(receiptId)) fail('WORKSHOP_RECEIPT_INVALID');
  const record=(await store.get(`factory/receipt/${receiptId}`))?.value;
  const readback=record?.readback, result=readback?.machineResult?.workshopResult;
  if(record?.kind!=='FACTORY_RECEIPT_RECORD'||record.receipt?.receiptId!==receiptId||readback?.receiptId!==receiptId
    ||readback.domainVerified!==true||result?.operation!=='EXPORT_PACKAGE'||result.status!=='PASS'
    ||!readback.result?.artifactRefs?.includes(result.output?.ref)) fail('WORKSHOP_DELIVERY_UNVERIFIED');
  const artifact=await readWorkshopContent(store,result.output.ref,result.output.sha256);
  if(artifact.workId!==readback.workId||artifact.checkpointId!==readback.checkpointId) fail('WORKSHOP_DELIVERY_SCOPE_MISMATCH');
  return {package:artifact,artifactRef:result.output.ref,sha256:result.output.sha256,receipt:record.receipt,readback};
}
