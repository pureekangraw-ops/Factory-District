import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { createLocalR2Bucket } from './support/local-r2-bucket.mjs';
import { railRequest } from './support/rail-auth.mjs';

const SECRET = 'LOCAL-FICTIONAL-ONLY';
function handoff(domain, scope = [`EXECUTE:${domain}`]) {
  const workId = `LOCAL-${domain}`, checkpointId = `${workId}:EXTERNAL-99`;
  return { workId, checkpointId, ownerDomain: domain, intent: `EXECUTE_${domain}`, scope,
    inputRefs: ['fixture://brief'], expectedSourceSha: 'LOCAL-SOURCE',
    source: { stationId: 'CITY', system: 'METROPOLIS' },
    target: { stationId: 'FACTORY-STATION', system: 'FACTORY', component: 'FACTORY_HALL' },
    workPassRef: 'work-pass://local', workPass: { kind: 'WORK_PASS', version: 'WORK_PASS_V1',
      passId: 'local', status: 'ACTIVE', workId, checkpointId, actor: 'GO',
      permissions: { actions: ['handoff'], handoff: [{ stationId: 'FACTORY_STATION' }] } } };
}
function provider(domain) {
  const calls = [];
  const names = domain === 'CODE'
    ? ['inspectRepository','planChange','executeChange','runTests','build','inspectArtifact','ciCheckpoint','deploy','verifyRuntime']
    : ['inspectInput','interpretDesign','compose','createOrEdit','render','inspectVisual','compare','correct','exportOutput','verifyFinalOutput'];
  const p = { calls };
  for (const name of names) p[name] = async input => {
    calls.push({ name, workId: input.work.workId, checkpointId: input.work.checkpointId });
    return { status: 'PASS', sourceSha: 'fixture-source', runtimeSha: 'fixture-source',
      designVersion: 'fixture-design-1', evidenceRef: `fixture://proof/${name}`,
      artifactRef: 'fixture://artifact', deploymentRef: 'fixture://preview',
      runtimeRef: 'fixture://runtime', outputRef: 'fixture://output', planRef: 'fixture://plan' };
  };
  return p;
}
function app(domain, p) {
  const env = { RECORD_STORE: createLocalR2Bucket(), SOURCE_SHA: 'LOCAL-SOURCE',
    METROPOLIS_FACTORY_RAIL_SECRET: SECRET, [`${domain}_PROVIDER`]: p,
    CODE_TARGET: 'NODE_WEB', VISUAL_TARGET: 'UI_WEB', VISUAL_MODE: 'MENU' };
  return { env, fetch: req => worker.fetch(req, env) };
}
async function dispatch(app, input) {
  const r = await app.fetch(await railRequest('https://local.invalid/station/receive', {
    method: 'POST', secret: SECRET, body: JSON.stringify(input) }));
  return { status: r.status, body: await r.json() };
}
test('default LOGIC dispatch does not substitute DWARF placement for generic execution', async () => {
  const a = app('LOGIC', undefined);
  const result = await dispatch(a, handoff('LOGIC'));
  assert.equal(result.status, 409);
  assert.equal(result.body.readback.domainVerified, false);
  assert.equal(result.body.receipt.reason, 'LOGIC_RUNNER_NOT_CONFIGURED');
  assert.equal([...a.env.RECORD_STORE.records.keys()].some(key => key.includes('logic/trainees/')), false);
});

test('default LOGIC dispatch preserves explicit legacy placement and exact receipt readback', async () => {
  const a = app('LOGIC', undefined);
  const input = { ...handoff('LOGIC'), intent: 'PLACE_DWARF_LOGIC_TRAINEE' };
  const first = await dispatch(a, input);
  assert.equal(first.status, 202);
  assert.equal(first.body.readback.domainVerified, true);
  assert.equal(first.body.readback.machineResult.trainee.placement.productionAuthority, false);
  const repeat = await dispatch(a, input);
  assert.equal(repeat.body.receipt.receiptId, first.body.receipt.receiptId);
  const readback = await a.fetch(await railRequest(`https://local.invalid/station/readback/${first.body.receipt.receiptId}`, { secret: SECRET }));
  assert.deepEqual(await readback.json(), first.body.readback);
});

for (const domain of ['CODE','VISUAL']) {
  test(`${domain}: configured existing pipeline persists machine state and correlated receipt without replay`, async () => {
    const p = provider(domain), a = app(domain,p), input = handoff(domain, [`EXECUTE:${domain}`, ...(domain === 'CODE' ? ['DEPLOY:CODE'] : [])]);
    const first = await dispatch(a,input);
    assert.equal(first.status,202);
    const r = first.body.readback;
    assert.equal(r.domainVerified,true);
    assert.equal(r.machineResult.run.workCheckpointId,input.checkpointId);
    assert.equal(r.machineResult.run.checkpointId,'CP-04');
    assert.ok(r.result.artifactRefs.length);
    const state = await a.env.RECORD_STORE.get(`records/machine/runs/${r.machineResult.run.runId}`);
    assert.ok(state,'machine state must be durably stored');
    const persisted = JSON.parse(await state.text()).value;
    assert.equal(persisted.run.returnState,'RETURNED');
    assert.ok(persisted.evidence.length);
    const count = p.calls.length;
    const duplicate = await dispatch(a,input);
    assert.equal(duplicate.body.receipt.receiptId,first.body.receipt.receiptId);
    assert.equal(p.calls.length,count);
    const owner = await a.fetch(await railRequest(`https://local.invalid/station/readback/${r.receiptId}`, { secret: SECRET }));
    assert.deepEqual(await owner.json(),r);
  });
  test(`${domain}: missing provider stays UNKNOWN`, async () => {
    const a=app(domain,undefined);const r=await dispatch(a,handoff(domain));
    assert.equal(r.status,409);assert.equal(r.body.receipt.reason,'MACHINE_NOT_REGISTERED');
  });
  test(`${domain}: unsupported intent never invokes provider`, async () => {
    const p=provider(domain),a=app(domain,p);const r=await dispatch(a,{...handoff(domain),intent:'PLACE_DWARF_LOGIC_TRAINEE'});
    assert.equal(r.body.readback.domainVerified,false);assert.equal(p.calls.length,0);
  });
}
test('CODE never deploys without explicit DEPLOY:CODE scope', async () => {
  const p=provider('CODE'),a=app('CODE',p);const r=await dispatch(a,handoff('CODE'));
  assert.equal(r.body.readback.domainVerified,false);
  assert.equal(p.calls.some(x=>x.name==='deploy'),false);
});
for(const [domain,method,field] of [['CODE','inspectRepository','sourceSha'],['CODE','inspectArtifact','artifactRef'],['CODE','deploy','deploymentRef'],['VISUAL','interpretDesign','designVersion'],['VISUAL','exportOutput','outputRef']]) {
  test(`${domain} missing ${method}.${field} cannot complete`, async()=>{
    const p=provider(domain),original=p[method];p[method]=async input=>{const r=await original(input);delete r[field];return r;};
    const a=app(domain,p);const r=await dispatch(a,handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']));
    assert.equal(r.body.readback.domainVerified,false);
  });
}

for (const [domain,method,field,next] of [
  ['CODE','inspectRepository','sourceSha','executeChange'],
  ['VISUAL','interpretDesign','designVersion','createOrEdit'],
]) {
  test(`${domain} missing identity stops before ${next}`,async()=>{
    const p=provider(domain),original=p[method];p[method]=async input=>{const r=await original(input);delete r[field];return r;};
    const r=await dispatch(app(domain,p),handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']));
    assert.equal(r.body.readback.domainVerified,false);
    assert.equal(p.calls.some(x=>x.name===next),false);
  });
}
for (const domain of ['CODE','VISUAL']) {
  test(`${domain} provider exception cannot leak raw credentials`,async()=>{
    const p=provider(domain);p[domain==='CODE'?'inspectRepository':'inspectInput']=async()=>{throw new Error('Bearer LOCAL-SECRET-LEAK');};
    const r=await dispatch(app(domain,p),handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']));
    assert.equal(r.body.readback.domainVerified,false);
    assert.equal(JSON.stringify(r).includes('LOCAL-SECRET-LEAK'),false);
  });
}

for(const domain of ['CODE','VISUAL']) {
  test(`${domain} incomplete provider stays unregistered`,async()=>{
    const r=await dispatch(app(domain,{}),handoff(domain));
    assert.equal(r.body.receipt.reason,'MACHINE_NOT_REGISTERED');
  });
  test(`${domain} lost receipt preserves machine evidence without replay`,async()=>{
    const p=provider(domain),a=app(domain,p),put=a.env.RECORD_STORE.put.bind(a.env.RECORD_STORE);
    let fail=true;
    a.env.RECORD_STORE.put=async(key,...args)=>{
      if(fail&&key.startsWith('records/factory/receipt/')){fail=false;throw new Error('LOCAL_RECEIPT_FAILURE');}
      return put(key,...args);
    };
    const input=handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']);
    const failed=await dispatch(a,input);assert.notEqual(failed.status,202);
    const count=p.calls.length;assert.ok(count);
    const retry=await dispatch(a,input);
    assert.equal(retry.body.readback.domainVerified,false);
    assert.equal(retry.body.readback.reason,'FACTORY_EFFECT_UNRECONCILED');
    assert.equal(p.calls.length,count);
    assert.ok([...a.env.RECORD_STORE.records.keys()].some(k=>k.startsWith('records/machine/runs/')));
  });
}
for(const method of ['build','inspectArtifact','deploy']) {
  test(`CODE requires ${method} source identity`,async()=>{
    const p=provider('CODE'),original=p[method];p[method]=async input=>{const r=await original(input);delete r.sourceSha;return r;};
    const result=await dispatch(app('CODE',p),handoff('CODE',['EXECUTE:CODE','DEPLOY:CODE']));
    assert.equal(result.body.readback.domainVerified,false);
  });
}

for(const domain of ['CODE','VISUAL']) {
  for(const inputRefs of [[],[null]]) {
    test(`${domain} rejects unusable input references ${JSON.stringify(inputRefs)}`,async()=>{
      const p=provider(domain);const r=await dispatch(app(domain,p),{...handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']),inputRefs});
      assert.equal(r.body.readback.domainVerified,false);assert.equal(p.calls.length,0);
    });
  }
  test(`${domain} invalid configured target does not register`,async()=>{
    const a=app(domain,provider(domain));a.env[`${domain}_TARGET`]='toString';
    const r=await dispatch(a,handoff(domain));assert.equal(r.body.receipt.reason,'MACHINE_NOT_REGISTERED');
  });
}

for(const domain of ['CODE','VISUAL']) {
  for(const status of ['READY','ACCEPTED']) {
    test(`${domain} ${status} is not completed execution`,async()=>{
      const p=provider(domain),method=domain==='CODE'?'executeChange':'createOrEdit',original=p[method];
      p[method]=async input=>({...await original(input),status});
      const r=await dispatch(app(domain,p),handoff(domain,[`EXECUTE:${domain}`,'DEPLOY:CODE']));
      assert.equal(r.body.readback.domainVerified,false);
      assert.equal(p.calls.some(x=>x.name===(domain==='CODE'?'deploy':'exportOutput')),false);
    });
  }
}
