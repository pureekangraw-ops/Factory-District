import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewBridge } from '../crew-app/bridge.mjs';
const arrival={actor:'GO',current:{works:[]},authorizedActions:[]};
test('crew bridge refuses unconfigured credentials without network calls',async()=>{
 let calls=0;const bridge=createCrewBridge({fetcher:async()=>{calls++;}});
 assert.equal((await bridge.arrive()).reason,'METRO_NOT_CONFIGURED');assert.equal(calls,0);
});
test('crew bridge refreshes current arrival and does not invent Work',async()=>{
 const sent=[];const bridge=createCrewBridge({endpoint:'https://metro.example/mcp',token:'private',fetcher:async(url,init)=>{sent.push(JSON.parse(init.body));const body=JSON.parse(init.body);return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{structuredContent:arrival}}));}});
 assert.deepEqual(await bridge.arrive(),arrival);assert.equal(sent[0].params.name,'metropolis_arrive');assert.deepEqual(sent[0].params.arguments,{});
});
test('crew bridge checks current read grant before requesting Work',async()=>{
 const sent=[];const bridge=createCrewBridge({endpoint:'https://metro.example/mcp',token:'private',fetcher:async(url,init)=>{const body=JSON.parse(init.body);sent.push(body.params.name);return new Response(JSON.stringify({id:body.id,result:{structuredContent:arrival}}));}});
 assert.equal((await bridge.read('W')).reason,'NO_CURRENT_READ_GRANT');assert.deepEqual(sent,['metropolis_arrive']);
});
test('crew bridge reads existing granted Work and rejects mismatched readback',async()=>{
 const current={actor:'GO',authorizedActions:[{action:'read',workId:'W'}],current:{works:[{workId:'W',checkpointId:'CP'}]}};
 for(const workId of ['W','OTHER']) {
 const bridge=createCrewBridge({endpoint:'https://metro.example/mcp',token:'private',fetcher:async(url,init)=>{const body=JSON.parse(init.body);const data=body.params.name==='metropolis_arrive'?current:{record:{workId,checkpointId:'CP'}};return new Response(JSON.stringify({id:body.id,result:{structuredContent:data}}));}});
 const result=await bridge.read('W');assert.equal(result.reason,workId==='W'?undefined:'WORK_READBACK_MISMATCH');
 }
});
test('crew bridge never exposes provider error bodies or accepts wrong RPC IDs',async()=>{
 for(const rpc of [false,true]) {
 const bridge=createCrewBridge({endpoint:'https://metro.example/mcp',token:'private',fetcher:async()=>new Response(rpc?JSON.stringify({id:'wrong',result:{structuredContent:arrival}}):'private-token',{status:rpc?200:401})});
 const result=await bridge.arrive();assert.equal(result.status,'UNKNOWN');assert.ok(!JSON.stringify(result).includes('private-token'));
 }
});
test('crew bridge rejects insecure endpoints',()=>{
 assert.throws(()=>createCrewBridge({endpoint:'http://metro.example/mcp',token:'private'}),/HTTPS/);
});
