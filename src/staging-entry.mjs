import factory from './worker.mjs';
import { authenticateRailRequest } from './rail-auth.mjs';
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname.startsWith('/staging/artifact/')) {
      const auth=await authenticateRailRequest(request,env);
      if(!auth.ok)return Response.json({status:'DENIED',reason:auth.reason},{status:auth.status});
      let key;try{key=decodeURIComponent(url.pathname.slice('/staging/artifact/'.length));}catch{return new Response('Invalid key',{status:400});}
      if(!/^edge-results\/[a-zA-Z0-9%_-]+\/[a-zA-Z0-9%_-]+\/[a-zA-Z0-9%_-]+\/[a-zA-Z0-9.-]+$/.test(key))return new Response('Invalid key',{status:400});
      const obj=await env.RECORD_STORE.get(key);
      if(!obj)return new Response('Not found',{status:404});
      const headers=new Headers({'cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});
      obj.writeHttpMetadata(headers);headers.set('x-content-type-options','nosniff');
      return new Response(obj.body,{headers});
    }
    return factory.fetch(request,env);
  },
};
