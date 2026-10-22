import test from 'node:test';
import assert from 'node:assert/strict';
import {formatL1Artifact,L1_TASK_ID,L1_REQUEST_SHA256} from '../src/l1-text-artifact.mjs';
const requestText="FACTORY ACCEPTANCE TEST L1 — safe isolated artifact test only. Goal: produce a small deterministic text artifact containing exactly 'YGG FACTORY L1 PASS', Work/task identity and test timestamp; return source artifact reference, content digest, receipt and owner readback if supported. No customer data, no public publishing, no production application changes, no payment, no external communication. If no supported machine/authority for this exact artifact, fail closed with UNSUPPORTED or BLOCKED rather than substituting a LOGIC trainee placement or fabricating a receipt. This is a graded acceptance test; separate task creation from execution.";
const args={taskId:L1_TASK_ID,requestText,requestSha256:L1_REQUEST_SHA256,testTimestamp:'2026-10-22T02:30:00.000Z'};
test('pure local artifact formatting is deterministic for the persisted claim timestamp',async()=>{
 const a=await formatL1Artifact(args),b=await formatL1Artifact(args);assert.deepEqual(a,b);
 assert.match(a.content,/^YGG FACTORY L1 PASS\n/);assert.ok(a.content.includes(L1_TASK_ID));assert.ok(a.content.includes(args.testTimestamp));
 assert.equal(a.contentSha256,Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.content))).toString('hex'));
 assert.equal(a.receipt,undefined);assert.equal(a.executed,undefined);
});
test('formatter refuses unrelated tasks, modified requests and nonpersisted timestamps',async()=>{
 for(const patch of [{taskId:'task_'+'a'.repeat(32)},{requestSha256:'0'.repeat(64)},{requestText:requestText+'\n'},{testTimestamp:null},{testTimestamp:'2026-02-30T02:30:00.000Z'}])await assert.rejects(formatL1Artifact({...args,...patch}));
});
