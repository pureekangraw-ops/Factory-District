// Internal Factory execution identity. GO authenticates using its independent
// signed Cloudflare rail; GO never sends or requests a City Work Pass.
// The original machine contracts remain private implementation details.
const toHex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const GO_REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const GO_JOB_ID=/^GOJOB-[a-f0-9]{32}$/;
export const GO_DOMAINS=Object.freeze(['CODE','VISUAL','LOGIC']);
export async function factoryJobId(requestId) {
  if(typeof requestId!=='string'||!GO_REQUEST_ID.test(requestId))
    throw Object.assign(new Error('GO_REQUEST_ID_INVALID'),{code:'GO_REQUEST_ID_INVALID'});
  const sha=toHex(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('FACTORY_GO_DIRECT_JOB_V1:'+requestId.toLowerCase())));
  return 'GOJOB-'+sha.slice(0,32);
}
export function createInternalGoHandoff({jobId,domain,inputRef=null,sourceSha}) {
  if(!GO_JOB_ID.test(jobId)||!GO_DOMAINS.includes(domain)||
    !/^[a-f0-9]{40}$/.test(sourceSha||'')||
    (domain==='LOGIC' ? inputRef!==null :
      typeof inputRef!=='string'||!/^r2:\/\/factory\/edge-inputs\/go-[a-f0-9]{64}\.json#sha256=[a-f0-9]{64}$/.test(inputRef)))
    throw Object.assign(new Error('GO_FACTORY_CONTEXT_INVALID'),{code:'GO_FACTORY_CONTEXT_INVALID'});
  const checkpointId='CP-'+jobId;
  const passId='factory-go-'+jobId;
  const scope=domain==='CODE'?['EXECUTE:CODE','DEPLOY:CODE']:[`EXECUTE:${domain}`];
  // A private implementation ticket issued AFTER authenticating GO's HMAC,
  // not a City-issued / caller-supplied Work Pass.
  const pass={kind:'WORK_PASS',version:'WORK_PASS_V1',status:'ACTIVE',
    passId,workId:jobId,checkpointId,actor:'GO',issuedBy:'FACTORY_STATION',
    authorityTransferred:false,
    permissions:{actions:['handoff'],handoff:[{stationId:'FACTORY_STATION'}]}};
  return {
    workId:jobId,checkpointId,workPassRef:'work-pass://'+passId,workPass:pass,
    ownerDomain:domain,
    intent:domain==='CODE'?'EXECUTE_CODE':
      domain==='VISUAL'?'EXECUTE_VISUAL':'PLACE_DWARF_LOGIC_TRAINEE',
    scope,inputRefs:inputRef?[inputRef]:[],
    expectedSourceSha:sourceSha,requestedAt:new Date().toISOString(),
    source:{stationId:'GO-BRAIN',system:'go-together'},
    target:{stationId:'FACTORY-STATION',system:'factory-district',component:'FACTORY_HALL'}
  };
}
