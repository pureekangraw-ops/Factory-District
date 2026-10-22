// Pure artifact formatter used only by the exact-task L1 runtime; no I/O here.
// Timestamp must come from a persisted execution claim, never from a retry's clock.
export const L1_TASK_ID = 'task_d6c9e93a42fd4f339bb47d941428dd08';
export const L1_REQUEST_SHA256 = 'de0038fe8be999fe6a1c725156cd9684ac4887127ef783a659148ccdf36d0b24';
export async function formatL1Artifact({taskId, requestText, requestSha256, testTimestamp}) {
 if(taskId!==L1_TASK_ID || requestSha256!==L1_REQUEST_SHA256)throw Error('L1_SCOPE_MISMATCH');
 if(typeof requestText!=='string')throw Error('L1_REQUEST_REQUIRED');
 if(typeof testTimestamp!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(testTimestamp) || !Number.isFinite(Date.parse(testTimestamp)) || new Date(testTimestamp).toISOString()!==testTimestamp)throw Error('L1_PERSISTED_TIMESTAMP_REQUIRED');
 const digest=async text=>BufferlessHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 if(await digest(requestText)!==requestSha256)throw Error('L1_REQUEST_HASH_MISMATCH');
 const content=`YGG FACTORY L1 PASS\ntask_id=${taskId}\ncheckpoint_id=cp-${taskId}\nrequest_sha256=${requestSha256}\ntest_timestamp=${testTimestamp}\n`;
 return Object.freeze({content,contentSha256:await digest(content),contentType:'text/plain; charset=utf-8',taskId,checkpointId:'cp-'+taskId,requestSha256,testTimestamp});
}
function BufferlessHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
