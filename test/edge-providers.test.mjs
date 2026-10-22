import test from 'node:test';
import assert from 'node:assert/strict';
const module = () => import('../src/edge-providers.mjs');
const sha = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function bucket(){const m=new Map();return {m,async get(k){if(!m.has(k))return null;const b=m.get(k);return {text:()=>new Response(b).text(),arrayBuffer:()=>new Response(b).arrayBuffer()};},async put(k,b,opts){if(opts?.onlyIf?.etagDoesNotMatch==='*'&&m.has(k))return null;m.set(k,b);return {key:k};}};}
async function fixture(domain){
 const artifacts=bucket(),work={workId:'LOCAL-EDGE',checkpointId:'CP-EXTERNAL',ownerDomain:domain,inputRefs:[]};
 const manifest={schema:'FACTORY_EDGE_JOB_V1',workId:work.workId,checkpointId:work.checkpointId,domain,
 baseSource:'export default {fetch(){return new Response("before")}}',patch:{find:'before',replace:'after'},tests:[{path:'/',status:200,body:'after'}],design:{title:'Edge Visual',body:'Actual render input',accent:'#3355ee'},viewport:{width:800,height:600}};
 const text=JSON.stringify(manifest);await artifacts.put('edge-inputs/local.json',text);
 work.inputRefs=[`r2://factory-district-preview/edge-inputs/local.json#sha256=${await sha(text)}`];
 return {artifacts,work,manifest};
}
test('CODE edge provider patches, executes tests, stores and independently reloads runtime',async()=>{
 const {createEdgeCodeProvider}=await module(),f=await fixture('CODE');let loads=0;
 const env={ARTIFACT_BUCKET:'factory-district-preview',ARTIFACTS:f.artifacts,LOADER:{load(config){loads++;assert.equal(config.globalOutbound,null);return {getEntrypoint(){return {async fetch(request){const m=await import('data:text/javascript,'+encodeURIComponent(config.modules['main.js']));return m.default.fetch(request);}};}};},get(id,cb){return {getEntrypoint(){return {async fetch(request){const c=await cb();return env.LOADER.load(c).getEntrypoint().fetch(request);}};}};}}};
 const p=createEdgeCodeProvider(env);const input={work:f.work,run:{runId:'LOCAL-RUN'}};
 const repository=await p.inspectRepository(input);await p.planChange({...input,repository});await p.executeChange(input);
 await p.runTests(input);const build=await p.build(input);await p.inspectArtifact({...input,build});await p.ciCheckpoint(input);
 const deployment=await p.deploy(input);const runtime=await p.verifyRuntime({...input,deployment});
 assert.equal(runtime.runtimeSha,repository.sourceSha);assert.ok(loads>=3);assert.ok(f.artifacts.m.size>5);
});
test('edge provider refuses changed or cross-Work manifest before side effects',async()=>{
 const {createEdgeCodeProvider}=await module(),f=await fixture('CODE'),p=createEdgeCodeProvider({ARTIFACT_BUCKET:'factory-district-preview',ARTIFACTS:f.artifacts});
 await assert.rejects(p.inspectRepository({work:{...f.work,workId:'OTHER'},run:{runId:'LOCAL'}}),/CORRELATION/);
 await f.artifacts.put('edge-inputs/local.json',JSON.stringify({...f.manifest,baseSource:'changed'}));
 await assert.rejects(p.inspectRepository({work:f.work,run:{runId:'LOCAL'}}),/DIGEST/);
});
test('VISUAL edge provider exports verified PNG rather than an accepted request',async()=>{
 const {createEdgeVisualProvider}=await module(),f=await fixture('VISUAL');let rendered='';
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAIAAAAVFBUnAAAKr0lEQVR4nO3WQQ3AIADAQMAFb0Tg39lMNCFZ7hT02bnPHQAAdNbrAACAvzFYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEDNYAAAxgwUAEPsAk34FI8W/hlwAAAAASUVORK5CYII=','base64'));
 const p=createEdgeVisualProvider({ARTIFACT_BUCKET:'factory-district-preview',ARTIFACTS:f.artifacts,BROWSER:{async quickAction(name,opts){rendered=opts.html;if(name==='screenshot')return new Response(bytes,{headers:{'content-type':'image/png'}});return new Response(JSON.stringify({success:true,result:opts.html}));}}});
 const input={work:f.work,run:{runId:'LOCAL-VISUAL'}};await p.inspectInput(input);const design=await p.interpretDesign(input);
 await p.compose(input);await p.createOrEdit(input);await p.render(input);await p.inspectVisual(input);await p.compare(input);
 const output=await p.exportOutput(input),final=await p.verifyFinalOutput({...input,output});
 assert.ok(output.outputRef.includes('.png'));assert.equal(final.designVersion,design.designVersion);assert.ok(rendered.includes("default-src 'none'"));
});

test('PNG inspection rejects a truncated header masquerading as an image',async()=>{
 const {inspectEdgePng}=await module();const bytes=new Uint8Array(24);
 bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(16,800);new DataView(bytes.buffer).setUint32(20,600);
 assert.throws(()=>inspectEdgePng(bytes,{width:800,height:600}),/PNG/);
});

for (const domain of ['CODE', 'VISUAL']) {
  test(`${domain} primary bucket references cannot cross into preview`, async () => {
    const providers = await module(), f = await fixture(domain);
    const create = domain === 'CODE' ? providers.createEdgeCodeProvider : providers.createEdgeVisualProvider;
    const p = create({ ARTIFACT_BUCKET: 'factory', ARTIFACTS: f.artifacts });
    const input = { work: f.work, run: {runId: 'PRIMARY-LOCAL'} };
    const inspect = domain === 'CODE' ? 'inspectRepository' : 'inspectInput';
    await assert.rejects(p[inspect](input), /REFERENCE_INVALID/);
    input.work.inputRefs = input.work.inputRefs.map(ref => ref.replace('factory-district-preview/', 'factory/'));
    const result = await p[inspect](input);
    assert.ok(result.evidenceRef.startsWith('r2://factory/edge-results/'));
    const missing = create({ ARTIFACTS: f.artifacts });
    await assert.rejects(missing[inspect](input), /BUCKET_NOT_CONFIGURED/);
  });
}
