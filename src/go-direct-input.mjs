// Factory-owned immutable job input package; no City Work Pass to prepare.
export const GO_MAX_INPUT_BYTES=65536;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max;
const only=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).every(k=>keys.includes(k));
export function validateGoJobSpec(domain,spec){
  if(domain==='LOGIC') {
    if(!only(spec,['placement'])||spec.placement!=='DWARF-01_TRAINING')
      fail('GO_LOGIC_UNSUPPORTED');
    return;
  }
  if(!only(spec,domain==='CODE'?['baseSource','patch','tests']:['design','viewport']))
    fail('GO_JOB_SPEC_INVALID');
  if(domain==='CODE'){
    if(!text(spec.baseSource,48000)||!only(spec.patch,['find','replace'])||
      !text(spec.patch.find,4096)||typeof spec.patch.replace!=='string'||
      spec.patch.replace.length>48000||
      spec.baseSource.split(spec.patch.find).length!==2||
      !Array.isArray(spec.tests)||!spec.tests.length||spec.tests.length>8)
      fail('GO_CODE_SPEC_INVALID');
    for(const t of spec.tests){
      if(!only(t,['path','status','body'])||
        !/^\/[A-Za-z0-9/_-]*$/.test(t.path||'')||
        !Number.isInteger(t.status)||t.status<100||t.status>599||
        typeof t.body!=='string'||t.body.length>4096)
        fail('GO_CODE_SPEC_INVALID');
    }
  }else if(domain==='VISUAL'){
    if(!only(spec.design,['title','body','accent'])||
      !text(spec.design.title,100)||typeof spec.design.body!=='string'||
      spec.design.body.length>1000||!/^(#[0-9a-fA-F]{6})$/.test(spec.design.accent||'')||
      !only(spec.viewport,['width','height'])||
      !Number.isInteger(spec.viewport.width)||spec.viewport.width<320||
      spec.viewport.width>1440||!Number.isInteger(spec.viewport.height)||
      spec.viewport.height<200||spec.viewport.height>1200)
      fail('GO_VISUAL_SPEC_INVALID');
  }else fail('GO_DOMAIN_UNSUPPORTED');
}
export async function prepareGoJobInput(bucket,{domain,jobId,checkpointId,spec}={}){
  validateGoJobSpec(domain,spec);
  if(domain==='LOGIC')return null;
  if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function')
    fail('GO_INPUT_STORAGE_NOT_CONFIGURED');
  const document={schema:'FACTORY_EDGE_JOB_V1',domain,workId:jobId,
    checkpointId,...(domain==='CODE'?{
      baseSource:spec.baseSource,patch:spec.patch,tests:spec.tests
    }:{design:spec.design,viewport:spec.viewport})};
  const bytes=new TextEncoder().encode(JSON.stringify(document));
  if(bytes.length>GO_MAX_INPUT_BYTES)fail('GO_INPUT_TOO_LARGE');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  const key=`edge-inputs/go-${digest}.json`;
  const old=await bucket.get(key);
  if(old){
    if(await old.text()!==new TextDecoder().decode(bytes))fail('GO_INPUT_CONTENT_CONFLICT');
  } else {
    // Same immutable bytes for the same content hash. Concurrent writers
    // cannot change the identity or authorization of this bounded input.
    await bucket.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
  }
  const saved=await bucket.get(key);
  if(!saved||await saved.text()!==new TextDecoder().decode(bytes))
    fail('GO_INPUT_READBACK_FAILED');
  return `r2://factory/${key}#sha256=${digest}`;
}
