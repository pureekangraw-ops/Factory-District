import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrewService } from '../crew-app/service.mjs';
test('app serves responsive interface and isolated read endpoints',async()=>{
 const service=createCrewService({bridge:{arrive:async()=>({actor:'GO',current:{works:[]}}),read:async id=>({record:{workId:id}})}});
 const html=await service(new Request('http://127.0.0.1:8788/'));
 assert.equal(html.status,200);assert.match(await html.text(),/viewport/);
 const result=await service(new Request('http://127.0.0.1:8788/api/arrival'));
 assert.equal((await result.json()).actor,'GO');assert.equal(result.headers.get('cache-control'),'no-store');
});
test('app rejects remote host, foreign origin and write methods before bridge calls',async()=>{
 let calls=0;const service=createCrewService({bridge:{arrive:async()=>{calls++;}}});
 for(const req of [new Request('http://evil.example/api/arrival'),new Request('http://127.0.0.1:8788/api/arrival',{headers:{origin:'https://evil.example'}}),new Request('http://127.0.0.1:8788/api/arrival',{method:'POST'})]) assert.equal((await service(req)).status,403);
 assert.equal(calls,0);
});
