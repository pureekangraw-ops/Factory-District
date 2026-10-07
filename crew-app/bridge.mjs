// Server-side, read-only bridge. Owner-issued OAuth credential never reaches UI.
export function createCrewBridge({endpoint, token, fetcher=fetch}={}) {
  if(endpoint) { const url=new URL(endpoint); if(url.protocol!=='https:'||url.username||url.password) throw new Error('METRO_HTTPS_REQUIRED'); }
  const unknown=reason=>({status:'UNKNOWN',reason});
  async function call(name,args={}) {
    if(!endpoint||!token) return unknown('METRO_NOT_CONFIGURED');
    try {
      const id=crypto.randomUUID();
      const response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})});
      if(!response.ok) return unknown(response.status===401?'METRO_AUTH_REQUIRED':'METRO_UNAVAILABLE');
      const body=await response.json();
      if(body.id!==id||body.error||body.result?.isError) return unknown('METRO_RESPONSE_UNVERIFIED');
      const result=body.result;
      const data=result?.structuredContent ?? JSON.parse(result?.content?.find(x=>x.type==='text')?.text ?? 'null');
      if(!data||typeof data!=='object'||Array.isArray(data)) return unknown('METRO_RESPONSE_UNVERIFIED');
      return data;
    } catch { return unknown('METRO_UNAVAILABLE'); }
  }
  async function arrive() {
    const data=await call('metropolis_arrive');
    if(data.status==='UNKNOWN') return data;
    if(!['GO','LIGHT'].includes(data.actor)||!Array.isArray(data.current?.works)||!Array.isArray(data.authorizedActions)) return unknown('METRO_RESPONSE_UNVERIFIED');
    return data;
  }
  async function read(workId) {
    if(typeof workId!=='string'||!workId.trim()) return unknown('WORK_REQUIRED');
    const current=await arrive(); if(current.status==='UNKNOWN') return current;
    const work=current.current.works.find(w=>w.workId===workId);
    if(!work?.checkpointId||!current.authorizedActions.some(g=>g.workId===workId&&g.action==='read')) return unknown('NO_CURRENT_READ_GRANT');
    const result=await call('metropolis_work',{workId,action:'read'});
    if(result.status==='UNKNOWN') return result;
    if(result.record?.workId!==workId||result.record?.checkpointId!==work.checkpointId) return unknown('WORK_READBACK_MISMATCH');
    return result;
  }
  return Object.freeze({arrive,read});
}
