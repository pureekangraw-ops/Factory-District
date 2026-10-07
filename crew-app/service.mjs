import { readFile } from 'node:fs/promises';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.mjs':['app.mjs','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export function createCrewService({bridge}={}) {
 return async request=>{
  const url=new URL(request.url),origin=request.headers.get('origin');
  const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'content-type':'application/json'}});
  if(!['127.0.0.1','localhost'].includes(url.hostname)||(origin&&origin!==url.origin)||request.method!=='GET')return json({status:'UNKNOWN',reason:'LOCAL_READ_ONLY'},403);
  if(files[url.pathname]){const [name,type]=files[url.pathname];return new Response(await readFile(new URL(name,import.meta.url)),{headers:{...headers,'content-type':type}});}
  try{
   if(url.pathname==='/api/arrival')return json(await bridge.arrive());
   if(url.pathname==='/api/work')return json(await bridge.read(url.searchParams.get('workId')));
  }catch{return json({status:'UNKNOWN',reason:'APP_UNAVAILABLE'},503);}
  return json({status:'UNKNOWN',reason:'ROUTE_NOT_FOUND'},404);
 };
}
