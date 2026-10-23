function bucketName(env) {
  const name = env.ARTIFACT_BUCKET;
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name))
    throw new Error('EDGE_BUCKET_NOT_CONFIGURED');
  return name;
}
const textBytes = text => new TextEncoder().encode(text);
export async function edgeDigest(value) {
  const bytes = typeof value === 'string' ? textBytes(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const check = (value,code) => { if(!value)throw new Error(code); };
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ref = (env, key) => `r2://${bucketName(env)}/${key}`;
const prefix = input => `edge-results/${encodeURIComponent(input.work.workId)}/${encodeURIComponent(input.work.checkpointId)}/${encodeURIComponent(input.run.runId)}`;
async function read(env,key) {const obj=await env.ARTIFACTS.get(key);check(obj,'EDGE_OBJECT_NOT_FOUND');return obj;}
async function save(env,key,value,type='application/json') {
  const body=type==='application/json'?JSON.stringify(value):value;
  const existing=await env.ARTIFACTS.get(key);
  if(existing){
    const old=await existing.arrayBuffer(),next=typeof body==='string'?textBytes(body):body;
    check(await edgeDigest(old)===await edgeDigest(next),'EDGE_OBJECT_CONFLICT');
    return ref(env,key);
  }
  const saved=await env.ARTIFACTS.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:type}});
  check(saved,'EDGE_OBJECT_CONFLICT');return ref(env,key);
}
async function job(env,input,domain){
 check(input?.work?.ownerDomain===domain,'EDGE_DOMAIN_MISMATCH');
 const refs=input.work.inputRefs;check(Array.isArray(refs)&&refs.length===1,'EDGE_INPUT_REQUIRED');
 const match=/^r2:\/\/([a-z0-9-]+)\/(edge-inputs\/[a-zA-Z0-9-]+\.json)#sha256=([a-f0-9]{64})$/.exec(refs[0]);
 check(match && match[1] === bucketName(env),'EDGE_INPUT_REFERENCE_INVALID');
 const obj=await read(env,match[2]),raw=await obj.text();check(textBytes(raw).length<=65536,'EDGE_INPUT_TOO_LARGE');
 check(await edgeDigest(raw)===match[3],'EDGE_INPUT_DIGEST_MISMATCH');
 const m=JSON.parse(raw);check(m.schema==='FACTORY_EDGE_JOB_V1'&&m.domain===domain&&m.workId===input.work.workId&&m.checkpointId===input.work.checkpointId,'EDGE_INPUT_CORRELATION_MISMATCH');
 return m;
}
async function evidence(env,input,step,data={}){
 const proof={schema:'FACTORY_EDGE_EVIDENCE_V1',workId:input.work.workId,checkpointId:input.work.checkpointId,runId:input.run.runId,step,...data};
 const evidenceRef=await save(env,`${prefix(input)}/${step}.json`,proof);
 return {status:'PASS',evidenceRef,...data};
}
function source(m){
 check(typeof m.baseSource==='string'&&m.baseSource.length<=48000&&m.patch&&typeof m.patch.find==='string'&&m.patch.find.length>0&&typeof m.patch.replace==='string','EDGE_SOURCE_INVALID');
 const parts=m.baseSource.split(m.patch.find);check(parts.length===2,'EDGE_PATCH_MUST_MATCH_ONCE');
 const code=parts.join(m.patch.replace);check(textBytes(code).length<=65536,'EDGE_SOURCE_TOO_LARGE');return code;
}
function workerCode(code){return {compatibilityDate:'2026-10-13',mainModule:'main.js',modules:{'main.js':code},globalOutbound:null};}
async function testCode(env,code,tests,stub=null){
 check(Array.isArray(tests)&&tests.length>0&&tests.length<=8,'EDGE_TESTS_REQUIRED');
 const target=stub||env.LOADER.load(workerCode(code)).getEntrypoint();
 const observed=[];
 for(const test of tests){
   check(typeof test.path==='string'&&/^\/[a-zA-Z0-9/_-]*$/.test(test.path)&&Number.isInteger(test.status)&&typeof test.body==='string'&&test.body.length<=4096,'EDGE_TEST_INVALID');
   const response=await target.fetch(new Request(`https://edge-test.invalid${test.path}`,{signal:AbortSignal.timeout(5000)}));
   const body=await response.text();check(body.length<=65536,'EDGE_RESPONSE_TOO_LARGE');
   observed.push({path:test.path,status:response.status,bodySha:await edgeDigest(body)});
   check(response.status===test.status&&body===test.body,'EDGE_RUNTIME_TEST_FAILED');
 }
 return observed;
}
export function createEdgeCodeProvider(env){
 const load=async input=>{const m=await job(env,input,'CODE');return {m,code:source(m)};};
 const stored=async input=>{const {m,code}=await load(input),persisted=await (await read(env,`${prefix(input)}/main.js`)).text();check(persisted===code,'EDGE_ARTIFACT_MISMATCH');return {m,code:persisted,sha:await edgeDigest(persisted)};};
 return Object.freeze({
  async inspectRepository(input){const {m,code}=await load(input);return evidence(env,input,'inspectRepository',{sourceSha:await edgeDigest(code),baseSha:await edgeDigest(m.baseSource),repo:input.work.inputRefs[0]});},
  async planChange(input){const {code}=await load(input);const result=await evidence(env,input,'planChange',{sourceSha:await edgeDigest(code),operation:'REPLACE_EXACTLY_ONCE'});return {...result,planRef:result.evidenceRef};},
  async executeChange(input){const {code}=await load(input);const artifactRef=await save(env,`${prefix(input)}/main.js`,code,'application/javascript');return evidence(env,input,'executeChange',{commitSha:await edgeDigest(code),artifactRef});},
  async runTests(input){const {m,code}=await stored(input);return evidence(env,input,'runTests',{observed:await testCode(env,code,m.tests)});},
  async build(input){const {code,sha}=await stored(input);return evidence(env,input,'build',{sourceSha:sha,artifactRef:ref(env,`${prefix(input)}/main.js`),bytes:textBytes(code).length,format:'WORKER_ES_MODULE'});},
  async inspectArtifact(input){const {sha}=await stored(input);return evidence(env,input,'inspectArtifact',{sourceSha:sha,artifactRef:ref(env,`${prefix(input)}/main.js`)});},
  async ciCheckpoint(input){const {m,code}=await stored(input);return evidence(env,input,'ciCheckpoint',{observed:await testCode(env,code,m.tests),verificationScope:'EDGE_RUNTIME_TESTS_NOT_GITHUB_CI'});},
  async deploy(input){const {m,code,sha}=await stored(input);const id=`${bucketName(env)}-${sha}`;const stub=env.LOADER.get(id,async()=>workerCode(code)).getEntrypoint();await testCode(env,code,m.tests,stub);const deploymentRef=await save(env,`${prefix(input)}/deployment.json`,{schema:'FACTORY_DYNAMIC_DEPLOYMENT_V1',workerId:id,sourceSha:sha,artifactKey:`${prefix(input)}/main.js`,workId:input.work.workId,checkpointId:input.work.checkpointId});return evidence(env,input,'deploy',{sourceSha:sha,deploymentRef,deploymentKind:'DYNAMIC_WORKER_SANDBOX'});},
  async verifyRuntime(input){const {m,code,sha}=await stored(input);const deployment=JSON.parse(await (await read(env,`${prefix(input)}/deployment.json`)).text());check(deployment.sourceSha===sha&&deployment.artifactKey===`${prefix(input)}/main.js`,'EDGE_DEPLOYMENT_MISMATCH');const observed=await testCode(env,code,m.tests);return evidence(env,input,'verifyRuntime',{runtimeSha:sha,runtimeRef:ref(env,`${prefix(input)}/deployment.json`),observed});},
 });
}
function design(m){
 check(m.design&&typeof m.design.title==='string'&&m.design.title.length>0&&m.design.title.length<=100&&typeof m.design.body==='string'&&m.design.body.length<=1000&&/^#[0-9a-fA-F]{6}$/.test(m.design.accent),'EDGE_DESIGN_INVALID');
 check(Number.isInteger(m.viewport?.width)&&m.viewport.width>=320&&m.viewport.width<=1440&&Number.isInteger(m.viewport?.height)&&m.viewport.height>=200&&m.viewport.height<=1200,'EDGE_VIEWPORT_INVALID');
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escape(m.design.title)}</title><style>body{margin:0;min-height:100vh;background:#101525;color:#f5f7ff;font-family:Arial,sans-serif;display:grid;place-items:center}.card{box-sizing:border-box;width:80%;max-width:640px;padding:48px;border:1px solid #39435b;border-top:8px solid ${m.design.accent};border-radius:24px;background:#1b2338}h1{font-size:40px;margin:0 0 24px}p{font-size:20px;line-height:1.6;color:#c9d3e9}small{color:#8c9bb8}</style></head><body><main class="card"><small>FACTORY</small><h1>${escape(m.design.title)}</h1><p>${escape(m.design.body)}</p></main></body></html>`;
}
export function inspectEdgePng(bytes,viewport){
 const b=new Uint8Array(bytes);check(b.length>=45&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v),'EDGE_PNG_INVALID');
 check([73,72,68,82].every((v,i)=>b[12+i]===v)&&[73,69,78,68].every((v,i)=>b[b.length-8+i]===v),'EDGE_PNG_INVALID');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 check(width===viewport.width&&height===viewport.height,'EDGE_PNG_DIMENSIONS_MISMATCH');return {width,height,bytes:b.length};
}
export function createEdgeVisualProvider(env){
 const load=async input=>{const m=await job(env,input,'VISUAL'),html=design(m);return {m,html,version:await edgeDigest(html)};};
 const stored=async input=>{const x=await load(input);check(await (await read(env,`${prefix(input)}/page.html`)).text()===x.html,'EDGE_ARTIFACT_MISMATCH');return x;};
 async function png(input){const x=await stored(input),bytes=await (await read(env,`${prefix(input)}/render.png`)).arrayBuffer();return {...x,bytes,dimensions:inspectEdgePng(bytes,x.m.viewport)};}
 return Object.freeze({
  async inspectInput(input){const {m}=await load(input);return evidence(env,input,'inspectInput',{viewport:m.viewport});},
  async interpretDesign(input){const {version}=await load(input);return evidence(env,input,'interpretDesign',{designVersion:version,template:'STATIC_CARD_V1'});},
  async compose(input){const {version}=await load(input);return evidence(env,input,'compose',{designVersion:version});},
  async createOrEdit(input){const {html,version}=await load(input);const outputRef=await save(env,`${prefix(input)}/page.html`,html,'text/html');return evidence(env,input,'createOrEdit',{designVersion:version,outputRef});},
  async render(input){const {m,html,version}=await stored(input);const result=await env.BROWSER.quickAction('screenshot',{html,viewport:m.viewport,screenshotOptions:{type:'png',fullPage:false}});check(result.ok,'EDGE_BROWSER_RENDER_FAILED');const bytes=await result.arrayBuffer();const dimensions=inspectEdgePng(bytes,m.viewport);const renderRef=await save(env,`${prefix(input)}/render.png`,bytes,'image/png');return evidence(env,input,'render',{designVersion:version,renderRef,pngSha:await edgeDigest(bytes),...dimensions});},
  async inspectVisual(input){const x=await png(input);return evidence(env,input,'inspectVisual',{...x.dimensions,pngSha:await edgeDigest(x.bytes),inspectionScope:'PNG_STRUCTURE_AND_VIEWPORT'});},
  async compare(input){const {m,html,version}=await png(input);const result=await env.BROWSER.quickAction('content',{html,viewport:m.viewport});check(result.ok,'EDGE_BROWSER_CONTENT_FAILED');let content=await result.text();try{const data=JSON.parse(content);check(data.success!==false,'EDGE_BROWSER_CONTENT_FAILED');content=typeof data.result==='string'?data.result:content;}catch(error){if(error.message==='EDGE_BROWSER_CONTENT_FAILED')throw error;}
    check(content.includes(escape(m.design.title))&&content.includes(escape(m.design.body)),'EDGE_RENDERED_TEXT_MISMATCH');await save(env,`${prefix(input)}/rendered.html`,content,'text/html');return evidence(env,input,'compare',{designVersion:version,comparisonScope:'RENDERED_TEXT_AND_VIEWPORT_NOT_AESTHETIC_REVIEW'});},
  async correct(){throw new Error('EDGE_CORRECTION_REQUIRES_NEW_OWNER_INPUT');},
  async exportOutput(input){const x=await png(input);return evidence(env,input,'exportOutput',{designVersion:x.version,outputRef:ref(env,`${prefix(input)}/render.png`),pngSha:await edgeDigest(x.bytes)});},
  async verifyFinalOutput(input){const x=await png(input);const proof=JSON.parse(await (await read(env,`${prefix(input)}/render.json`)).text());check(proof.pngSha===await edgeDigest(x.bytes)&&proof.designVersion===x.version,'EDGE_OUTPUT_DIGEST_MISMATCH');return evidence(env,input,'verifyFinalOutput',{designVersion:x.version,outputRef:ref(env,`${prefix(input)}/render.png`),pngSha:await edgeDigest(x.bytes)});},
 });
}
