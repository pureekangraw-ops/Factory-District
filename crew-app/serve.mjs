import http from 'node:http';
import {createCrewBridge} from './bridge.mjs';
import {createCrewService} from './service.mjs';
const service=createCrewService({bridge:createCrewBridge({endpoint:process.env.METROPOLIS_MCP_URL,token:process.env.METROPOLIS_ACCESS_TOKEN})});
http.createServer(async(req,res)=>{
 try{
 const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers});
 const result=await service(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'text/plain'});res.end('APP_UNAVAILABLE');}
}).listen(8788,'127.0.0.1',()=>process.stdout.write('Dwarf Crew: http://127.0.0.1:8788\n'));
