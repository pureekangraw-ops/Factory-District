import {validateGoDirectHandoff} from './go-direct-rail.mjs';

// GO-origin work inputs are immutable, content-addressed R2 files. The sender
// must present an existing CITY_HALL-issued GO Work Pass. No new Work/Task IDs
// or authority are issued by this endpoint.
const MAX_INPUT_BYTES=65536;
const fail=reason=>{const error=new Error(reason);error.code=reason;throw error;};
const str=(s,max=160)=>typeof s==='string'&&s.length>0&&s.length<=max;
function hasOnly(o,allowed){
  return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
}
function checkJobSpec(domain,spec) {
  if(!spec||typeof spec!=='object'||Array.isArray(spec))fail('GO_INPUT_SPEC_REQUIRED');
  if(domain==='CODE') {
    if(!hasOnly(spec,['baseSource','patch','tests'])||
      !str(spec.baseSource,48000)||!hasOnly(spec.patch,['find','replace'])||
      !str(spec.patch.find,4096)||typeof spec.patch.replace!=='string'||
      spec.patch.replace.length>48000||spec.baseSource.split(spec.patch.find).length!==2||
      !Array.isArray(spec.tests)||spec.tests.length===0||spec.tests.length>8)
      fail('GO_CODE_SPEC_INVALID');
    for(const t of spec.tests) {
      if(!hasOnly(t,['path','status','body'])||
        !/^\/[a-zA-Z0-9/_-]*$/.test(t.path||'')||
        !Number.isInteger(t.status)||t.status<100||t.status>599||
        typeof t.body!=='string'||t.body.length>4096)fail('GO_CODE_SPEC_INVALID');
    }
  } else if(domain==='VISUAL') {
    if(!hasOnly(spec,['design','viewport'])||
      !hasOnly(spec.design,['title','body','accent'])||
      !str(spec.design.title,100)||typeof spec.design.body!=='string'||
      spec.design.body.length>1000||
      !/^#[0-9a-fA-F]{6}$/.test(spec.design.accent||'')||
      !hasOnly(spec.viewport,['width','height'])||
      !Number.isInteger(spec.viewport.width)||
      spec.viewport.width<320||spec.viewport.width>1440||
      !Number.isInteger(spec.viewport.height)||
      spec.viewport.height<200||spec.viewport.height>1200)
      fail('GO_VISUAL_SPEC_INVALID');
  } else fail('GO_INPUT_DOMAIN_UNSUPPORTED');
}
function scope(domain){return domain==='CODE'?['EXECUTE:CODE','DEPLOY:CODE']:['EXECUTE:VISUAL'];}
function intent(domain){return domain==='CODE'?'EXECUTE_CODE':'EXECUTE_VISUAL';}
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}

export async function prepareGoInput(env, body, sourceSha) {
  if(!env.RECORD_STORE||typeof env.RECORD_STORE.get!=='function'||typeof env.RECORD_STORE.put!=='function')
    fail('GO_INPUT_STORAGE_NOT_CONFIGURED');
  if(!hasOnly(body,['workId','checkpointId','workPassRef','workPass','ownerDomain','expectedSourceSha','spec'])||
    !str(body.workId,128)||!str(body.checkpointId,128)||
    !/^[a-f0-9]{40}$/.test(body.expectedSourceSha||'')||
    body.expectedSourceSha!==sourceSha||
    body.workPass?.issuedBy!=='CITY_HALL')
    fail('GO_INPUT_WORK_CONTEXT_INVALID');
  const domain=body.ownerDomain;
  checkJobSpec(domain,body.spec);
  const checked={
    workId:body.workId,checkpointId:body.checkpointId,workPassRef:body.workPassRef,
    workPass:body.workPass,ownerDomain:domain,intent:intent(domain),scope:scope(domain),
    inputRefs:['r2://factory/edge-inputs/GO-PLACEHOLDER.json#sha256='+'0'.repeat(64)],
    expectedSourceSha:body.expectedSourceSha,requestedAt:new Date().toISOString(),
    source:{system:'go-together',stationId:'GO-BRAIN'},
    target:{system:'factory-district',stationId:'FACTORY-STATION',component:'FACTORY_HALL'}
  };
  validateGoDirectHandoff(checked);
  const doc={schema:'FACTORY_EDGE_JOB_V1',domain,workId:body.workId,
    checkpointId:body.checkpointId,
    ...(domain==='CODE'?{
      baseSource:body.spec.baseSource,patch:body.spec.patch,tests:body.spec.tests
    }:{
      design:body.spec.design,viewport:body.spec.viewport
    })};
  const raw=JSON.stringify(doc),size=new TextEncoder().encode(raw).length;
  if(size>MAX_INPUT_BYTES)fail('GO_INPUT_TOO_LARGE');
  const sha=await digest(raw);
  const key='edge-inputs/go-'+sha+'.json';
  const existing=await env.RECORD_STORE.get(key);
  if(existing){
    if(await existing.text()!==raw)fail('GO_INPUT_CONTENT_CONFLICT');
  } else {
    await env.RECORD_STORE.put(key,raw,{httpMetadata:{contentType:'application/json'}});
  }
  const reread=await env.RECORD_STORE.get(key);
  if(!reread||await reread.text()!==raw)fail('GO_INPUT_STORAGE_READBACK_FAILED');
  return {status:'INPUT_PREPARED',workId:body.workId,checkpointId:body.checkpointId,
    domain,sourceSha,ref:'r2://factory/'+key+'#sha256='+sha,sha256:sha,bytes:size,
    alreadyExists:Boolean(existing),executed:false};
}
