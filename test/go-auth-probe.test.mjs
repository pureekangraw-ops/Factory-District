import test from 'node:test';
import assert from 'node:assert/strict';
import {createFactoryWorker} from '../src/worker.mjs';
import {createDurableStore} from '../src/durable-store.mjs';
import {createInMemoryDurableDriver} from './support/in-memory-durable-driver.mjs';
import {goRailSecretConfigured,GO_AUTH_PROBE_PURPOSE} from '../src/rail-auth.mjs';

const SHA='a'.repeat(40);
const NONCE='1234567890abcdef1234567890abcdef';
const RANDOM_KEY='GO$k2.!q_10yz/Wyq3+S1r0akB2F^mln7QrXxB9F#pR';
const PREFIX='https://factory.test';

function fixture(secret=RANDOM_KEY) {
  let executions=0,writes=0;
  const env={GO_FACTORY_RAIL_SECRET:secret,SOURCE_SHA:SHA,
    METROPOLIS_FACTORY_RAIL_SECRET:'metropolis-existing',
    PANTHEON_FACTORY_RAIL_SECRET:'pantheon-existing'};
  const driver=createInMemoryDurableDriver();
  for(const method of ['put','append']) {
    const original=driver[method];
    driver[method]=async(...args)=>{writes++;return original(...args);};
  }
  const recordStore=createDurableStore({driver});
  const app=createFactoryWorker(env,{recordStore,
    domainRunners:{CODE:async()=>{executions++;throw Error('machine_called');}}});
  return {app,get executions(){return executions;},get writes(){return writes;}};
}
async function sign(path,{key=RANDOM_KEY,client='GO',purpose=GO_AUTH_PROBE_PURPOSE,
  nonce=NONCE}={}) {
  const body=JSON.stringify({purpose,nonce}),timestamp=String(Date.now());
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',hmac,
    new TextEncoder().encode(timestamp+'.'+body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return new Request(PREFIX+path,{method:'POST',headers:{
    'x-factory-client':client,'x-metropolis-factory-protocol':'METROPOLIS_FACTORY_STATION_V2',
    'x-metropolis-factory-timestamp':timestamp,'x-metropolis-factory-signature':sig
  },body});
}
test('opaque high-entropy GO secrets accepted, known placeholders and weak strings rejected',()=>{
  for(const value of [RANDOM_KEY,'a'.repeat(64),'b%4rN.99#bQrXVV_'] ) {
    if(value.length<32)continue;
    assert.equal(goRailSecretConfigured(value),true);
  }
  for(const value of [
    '',null,'short-key', 'PENDING_REPLACE_FACTORY_SIDE_20261023_INACTIVE',
    'PLACEHOLDER_NOT_REAL_KEY_SECURE_OCTOBER_2026',
    'DUMMY_THIS_IS_A_FAKE_SECRET_FOR_DEVELOPMENT',
    'GO$k2.!q_10yz/Wyq3+S1r0akB2F^mln7QrXxB9F#pR\n'
  ])assert.equal(goRailSecretConfigured(value),false);
});
test('Factory authenticates GET-free signed nonce probe without mutating Factory records',async()=>{
  const f=fixture(),req=await sign('/station/go-auth-probe');
  const response=await f.app.fetch(req);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(Object.keys(data).sort(),
    ['executed','nonce','proof','readOnly','service','sourceSha','stationId','status'].sort());
  assert.equal(data.status,'AUTHENTICATED');
  assert.equal(data.nonce,NONCE);
  assert.equal(data.sourceSha,SHA);
  assert.equal(data.readOnly,true);
  assert.equal(data.executed,false);
  assert.equal(f.executions,0);
  assert.equal(f.writes,0);
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(RANDOM_KEY),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const message=GO_AUTH_PROBE_PURPOSE+'\n'+NONCE+'\n'+SHA+'\nFACTORY-STATION';
  assert.equal(await crypto.subtle.verify('HMAC',hmac,
    Uint8Array.from(data.proof.match(/../g),x=>parseInt(x,16)),
    new TextEncoder().encode(message)),true);
  assert.doesNotMatch(JSON.stringify(data),/GO\$k2|metropolis-existing|pantheon-existing/);
});
test('Factory probe rejects mismatched HMAC, foreign principal, placeholder and malformed challenge',async()=>{
  const f=fixture();
  const badKey=await f.app.fetch(await sign('/station/go-auth-probe',{key:'z'.repeat(64)}));
  assert.equal(badKey.status,401);
  assert.equal((await badKey.json()).reason,'FACTORY_RAIL_SIGNATURE_INVALID');
  for(const client of ['CITY','PANTHEON']){
    const reject=await f.app.fetch(await sign('/station/go-auth-probe',{client}));
    assert.notEqual(reject.status,200);
  }
  const malformed=await f.app.fetch(await sign('/station/go-auth-probe',{nonce:'invalid'}));
  assert.equal(malformed.status,400);
  const inert=fixture('PENDING_REPLACE_FACTORY_SIDE_20261023_INACTIVE');
  const noKey=await inert.app.fetch(await sign('/station/go-auth-probe'));
  assert.equal(noKey.status,503);
  assert.equal((await noKey.json()).reason,'GO_FACTORY_RAIL_KEY_NOT_CONFIGURED');
  assert.equal(f.executions,0);
  assert.equal(f.writes,0);
});

// Validate the request boundary, not only the standalone format helper:
// the historical text() normalization incorrectly accepted these keys.
test('GO request authentication never trims configured secret bytes',async()=>{
  for(const secret of [' '+RANDOM_KEY,RANDOM_KEY+' ',RANDOM_KEY+'\n']) {
    const f=fixture(secret);
    for(const key of [RANDOM_KEY,secret]) {
      const response=await f.app.fetch(await sign('/station/go-auth-probe',{key}));
      assert.equal(response.status,503);
      assert.equal((await response.json()).reason,'GO_FACTORY_RAIL_KEY_NOT_CONFIGURED');
    }
    assert.equal(f.executions,0);
    assert.equal(f.writes,0);
  }
});
