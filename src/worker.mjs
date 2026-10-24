import {L1_TASK_ID} from './l1-text-artifact.mjs';
import {createL1Runtime,L1_INTENT,L1_RECEIPT_ID} from './l1-runtime.mjs';
import { createR2RecordStore } from './r2-record-store.mjs';
import { createFactoryRuntime } from './factory-runtime.mjs';
import { createPixieOperator } from './pixie-autonomous.mjs';
import { BUILD_SOURCE_SHA } from './build-source-identity.mjs';
import { authenticateRailRequest, railTransportHealth, validatePantheonHandoff, GO_AUTH_PROBE_PURPOSE, signGoAuthProbe } from './rail-auth.mjs';
import { createConfiguredMachinery } from './configured-machinery.mjs';
import { createLogicDispatcher } from './logic-dispatcher.mjs';
import { prepareGoJobInput, validateGoJobSpec } from './go-direct-input.mjs';
import { factoryJobId, createInternalGoHandoff } from './go-direct-rail.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function defaultHandlers(domainRunners) {
  const operator = createPixieOperator({ domainRunners });
  return Object.fromEntries(['CODE', 'VISUAL', 'LOGIC'].map((domain) => [domain, async ({ handoff }) => {
    if (handoff.intent === 'LIVE_E2E_BOUNDARY_HANDOFF') return { ownerDomain: domain, status: 'RECEIVED', completed: false, workId: handoff.workId };
    if (typeof domainRunners[domain] !== 'function') return { status: 'UNKNOWN', reason: 'MACHINE_NOT_REGISTERED' };
    const execution = await operator.run({ work: handoff, domain, machineId: `${domain}-MACHINE` });
    const result = execution.result;
    const run = result?.run;
    // Kernel runs carry an explicit ingress checkpoint while checkpointId advances
    // through internal phases. Legacy/simple runners return the Work checkpoint
    // directly. An explicit missing/conflicting correlation must never fall back.
    const workCheckpointId = Object.hasOwn(run || {}, 'workCheckpointId')
      ? run.workCheckpointId : run?.checkpointId;
    const correlationMismatch = run?.workId !== handoff.workId
      || workCheckpointId !== handoff.checkpointId;
    const verified = execution.status === 'RETURNED' && !correlationMismatch
      && Boolean(run.verificationRef) && Boolean(run.returnRef)
      && Array.isArray(run.evidenceRefs) && run.evidenceRefs.length > 0
      && run.evidenceRefs.every(ref => typeof ref === 'string' && ref.trim());
    const reason = verified ? null : correlationMismatch ? 'MACHINE_WORK_CHECKPOINT_MISMATCH'
      : result?.failure?.code || 'MACHINE_RESULT_UNVERIFIED';
    return { status: verified ? 'RETURNED' : 'UNKNOWN', reason, completed: Boolean(verified), machineResult: result || null, execution };
  }]));
}

function logRailReject({ phase, reason }) {
  console.warn('FACTORY_RAIL_REJECT', JSON.stringify({ phase, reason }));
}

export function createFactoryWorker(env = {}, { recordStore, domainRunners = {} } = {}) {
  const runtime = recordStore ? createFactoryRuntime({ sourceSha: env.SOURCE_SHA || env.COMMIT_SHA || 'UNKNOWN', domainHandlers: defaultHandlers(domainRunners), recordStore }) : null;
  const transport = railTransportHealth(env);
  const l1=recordStore?createL1Runtime(recordStore,env.SOURCE_SHA||env.COMMIT_SHA||'UNKNOWN'):null;

  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return json(runtime
          ? {
              ...runtime.health(),
              transport,
              machinery: Object.fromEntries(['CODE', 'VISUAL', 'LOGIC'].map(domain => [domain,
                domain === 'LOGIC' && domainRunners.LOGIC?.readiness ? domainRunners.LOGIC.readiness : {
                status: typeof domainRunners[domain] === 'function' ? 'READY' : 'UNKNOWN',
                reason: typeof domainRunners[domain] === 'function' ? null : 'MACHINE_NOT_REGISTERED',
              }])),
            }
          : {
              service: 'factory-district',
              status: 'UNKNOWN',
              storage: { status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' },
              transport,
            });
      }

      // Read-only mutual-key challenge. The existing HMAC rail authenticates
      // GO before returning a domain-separated signed nonce. Never creates a
      // Job, Work Pass, receipt, R2 record or any machine effect.
      if (request.method === 'POST' && url.pathname === '/station/go-auth-probe') {
        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok)
          return json({status:'DENIED', reason:authenticated.reason}, authenticated.status);
        if (authenticated.principal !== 'GO')
          return json({status:'DENIED', reason:'GO_RAIL_REQUIRED'}, 403);
        if (!runtime)
          return json({status:'UNKNOWN',reason:'DURABLE_STORAGE_NOT_CONFIGURED'},503);
        try {
          if (new TextEncoder().encode(authenticated.body).byteLength > 256)
            throw Error('AUTH_PROBE_INVALID');
          const input = JSON.parse(authenticated.body);
          if (!input || typeof input !== 'object' || Array.isArray(input) ||
              Object.keys(input).sort().join('|') !== 'nonce|purpose' ||
              input.purpose !== GO_AUTH_PROBE_PURPOSE ||
              typeof input.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(input.nonce))
            throw Error('AUTH_PROBE_INVALID');
          const sourceSha = runtime.health().sourceSha;
          const proof = await signGoAuthProbe(env.GO_FACTORY_RAIL_SECRET, input.nonce, sourceSha);
          return json({status:'AUTHENTICATED', service:'factory-district',
            stationId:'FACTORY-STATION',sourceSha,nonce:input.nonce,proof,
            readOnly:true,executed:false});
        } catch {
          return json({status:'DENIED',reason:'AUTH_PROBE_INVALID'},400);
        }
      }

      // Same HMAC rail, same Work Pass contract, no additional auth door.
      // This only checks boundary eligibility; receive() remains authoritative.
      if (request.method === 'POST' && url.pathname === '/station/preflight') {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);
        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok) {
          logRailReject({ phase: 'preflight', reason: authenticated.reason });
          return json({ status: 'DENIED', reason: authenticated.reason }, authenticated.status);
        }
        try {
          const input = JSON.parse(authenticated.body);
          if(input?.workId===L1_TASK_ID && input.intent!==L1_INTENT)throw Error('L1_TASK_RESERVED');
          if (authenticated.principal === 'PANTHEON') validatePantheonHandoff(input);
          if (authenticated.principal === 'GO')return json({status:'DENIED',reason:'GO_USE_JOB_ROUTE'},403);
          if(input.intent===L1_INTENT){
            if(authenticated.principal!=='PANTHEON')return json({status:'DENIED',reason:'PANTHEON_RAIL_REQUIRED'},403);
            return json(await l1.preflight(input));
          }
          const result = await runtime.preflight(input);
          return json(result, 200);
        } catch (error) {
          const reason = error.code || error.message;
          return json({ status: 'DENIED', allowed: false, reason },
            reason === 'SHA_MISMATCH' ? 409 : 403);
        }
      }

      if (request.method === 'POST' && url.pathname === '/station/receive') {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);

        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok) {
          logRailReject({ phase: 'receive', reason: authenticated.reason });
          return json({ status: 'DENIED', reason: authenticated.reason }, authenticated.status);
        }

        try {
          const input = JSON.parse(authenticated.body);
          if(input?.workId===L1_TASK_ID && input.intent!==L1_INTENT)throw Error('L1_TASK_RESERVED');
          if (authenticated.principal === 'PANTHEON') validatePantheonHandoff(input);
          if (authenticated.principal === 'GO')return json({status:'DENIED',reason:'GO_USE_JOB_ROUTE'},403);
          if(input.intent===L1_INTENT){
            if(authenticated.principal!=='PANTHEON')return json({status:'DENIED',reason:'PANTHEON_RAIL_REQUIRED'},403);
            return json(await l1.receive(input),202);
          }
          const result = await runtime.receive(input);
          const status = result.receipt.status === 'DENIED' ? 403 : result.receipt.status === 'UNKNOWN' ? 409 : 202;
          return json(result, status);
        } catch (error) {
          const reason = error.code || error.message;
          const status = reason === 'FACTORY_WORK_SCOPE_CONFLICT' || reason === 'FACTORY_CLAIM_UNCERTAIN'
            ? 409 : reason === 'STORAGE_UNAVAILABLE' ? 503 : 400;
          return json({ status: status === 409 ? 'UNKNOWN' : 'DENIED', reason }, status);
        }
      }

      // GO directly requests a Factory-owned job. No external Work Pass.
      // HMAC authenticates the GO principal; Factory derives internal machine
      // identity, scopes and deduplication key from the opaque request ID.
      if(request.method==='POST' && url.pathname==='/station/go-job') {
        if(!runtime||!env.RECORD_STORE)
          return json({status:'UNKNOWN',reason:'GO_JOB_STORAGE_NOT_CONFIGURED'},503);
        const auth=await authenticateRailRequest(request,env);
        if(!auth.ok)return json({status:'DENIED',reason:auth.reason},auth.status);
        if(auth.principal!=='GO')
          return json({status:'DENIED',reason:'GO_RAIL_REQUIRED'},403);
        let jobId=null,requestId=null;
        try{
          if(auth.body.length>65536)throw Object.assign(new Error('GO_JOB_TOO_LARGE'),{code:'GO_JOB_TOO_LARGE'});
          const input=JSON.parse(auth.body);
          if(!input||typeof input!=='object'||Array.isArray(input)||
            Object.keys(input).sort().join('|')!=='domain|expectedSourceSha|requestId|spec')
            throw Object.assign(new Error('GO_JOB_FIELDS_INVALID'),{code:'GO_JOB_FIELDS_INVALID'});
          requestId=input.requestId;
          jobId=await factoryJobId(requestId);
          const current=env.SOURCE_SHA||env.COMMIT_SHA||'UNKNOWN';
          if(!/^[a-f0-9]{40}$/.test(input.expectedSourceSha||'')||
            input.expectedSourceSha!==current)
            throw Object.assign(new Error('GO_FACTORY_SOURCE_MISMATCH'),{code:'GO_FACTORY_SOURCE_MISMATCH'});
          validateGoJobSpec(input.domain,input.spec);
          const checkpointId='CP-'+jobId;
          const inputRef=await prepareGoJobInput(env.RECORD_STORE,{
            domain:input.domain,jobId,checkpointId,spec:input.spec
          });
          const handoff=createInternalGoHandoff({jobId,domain:input.domain,inputRef,sourceSha:current});
          const done=await runtime.receive(handoff);
          const receiptId=done.receipt?.receiptId || null;
          const back=done.readback;
          const completed=Boolean(receiptId && back?.domainVerified===true &&
            back?.domainCompleted===true && back?.workId===jobId &&
            back?.originSystem==='go-together');
          return json({status:completed?'COMPLETED':'EFFECT_UNVERIFIED',
            jobId,requestId,receiptId,
            domain:input.domain,sourceSha:current,executed:completed,
            readback:back},completed?200:409);
        } catch(error) {
          const reason=typeof error?.code==='string'?error.code:'GO_JOB_EFFECT_UNCERTAIN';
          const status=reason==='GO_FACTORY_SOURCE_MISMATCH'||reason==='FACTORY_WORK_SCOPE_CONFLICT'?409:
            reason==='GO_JOB_TOO_LARGE'?413:
            reason==='GO_JOB_EFFECT_UNCERTAIN'?502:400;
          return json({status:status===409||status===502?'UNKNOWN':'DENIED',
            reason,jobId,requestId,executed:false},status);
        }
      }

      // Recovery is a read only lookup by GO requestId, not an execution retry.
      if(request.method==='POST' && url.pathname==='/station/go-job-status') {
        if(!runtime)return json({status:'UNKNOWN',reason:'GO_JOB_STORAGE_NOT_CONFIGURED'},503);
        const auth=await authenticateRailRequest(request,env);
        if(!auth.ok)return json({status:'DENIED',reason:auth.reason},auth.status);
        if(auth.principal!=='GO')return json({status:'DENIED',reason:'GO_RAIL_REQUIRED'},403);
        try{
          if(auth.body.length>256)throw Error('GO_STATUS_INVALID');
          const input=JSON.parse(auth.body);
          if(!input||typeof input!=='object'||Array.isArray(input)||
            Object.keys(input).join('|')!=='requestId')throw Error('GO_STATUS_INVALID');
          const jobId=await factoryJobId(input.requestId);
          const result=await runtime.lookupClaim(jobId,'CP-'+jobId);
          if(!result.receiptId)return json({status:'NOT_FOUND',jobId,requestId:input.requestId,executed:false},404);
          const back=result.readback;
          if(back && back.reason!=='RECEIPT_NOT_FOUND' &&
            (back.originSystem!=='go-together'||back.actingActor!=='GO'))
            return json({status:'DENIED',reason:'GO_JOB_READBACK_DENIED'},403);
          return json({status:back?.domainVerified===true?'COMPLETED':'UNKNOWN',
            jobId,requestId:input.requestId,receiptId:result.receiptId,
            readback:back,executed:back?.domainVerified===true});
        }catch{return json({status:'DENIED',reason:'GO_STATUS_INVALID'},400);}
      }

      // GO reads a real, private artifact only after authenticating its signed
      // principal and binding the requested R2 reference to its own receipt.
      // POST signs the exact JSON request body (including receipt/ref).
      if (request.method === 'POST' && url.pathname === '/station/go-artifact') {
        if (!runtime || !env.RECORD_STORE)
          return json({status:'UNKNOWN',reason:'ARTIFACT_STORAGE_NOT_CONFIGURED'},503);
        const authenticated=await authenticateRailRequest(request,env);
        if(!authenticated.ok)return json({status:'DENIED',reason:authenticated.reason},authenticated.status);
        if(authenticated.principal!=='GO')
          return json({status:'DENIED',reason:'GO_RAIL_REQUIRED'},403);
        try {
          if(authenticated.body.length>2048)throw Error('ARTIFACT_REQUEST_TOO_LARGE');
          const args=JSON.parse(authenticated.body);
          if(!args || typeof args!=='object' || Array.isArray(args) ||
            Object.keys(args).sort().join('|')!=='artifactRef|receiptId')
            throw Error('INVALID_ARTIFACT_REQUEST');
          const id=args.receiptId,ref=args.artifactRef;
          if(typeof id!=='string'||!/^receipt-[A-Za-z0-9-]{8,80}$/.test(id) ||
            typeof ref!=='string' || ref.length>900 ||
            !ref.startsWith('r2://factory/edge-results/'))
            throw Error('INVALID_ARTIFACT_REQUEST');
          const filename=ref.slice('r2://factory/'.length);
          if(filename.split('/').some(part=>!part||part==='.'||part==='..'||part.includes('\\')))
            throw Error('INVALID_ARTIFACT_PATH');
          const back=await runtime.readback(id);
          if(back.reason==='RECEIPT_NOT_FOUND')
            return json({status:'UNKNOWN',reason:'RECEIPT_NOT_FOUND'},404);
          if(back.actingActor!=='GO' || back.originSystem!=='go-together' ||
            back.authorizationSource!=='WORK_PASS' || back.domainVerified!==true ||
            !Array.isArray(back.result?.artifactRefs) || !back.result.artifactRefs.includes(ref))
            return json({status:'DENIED',reason:'ARTIFACT_NOT_IN_GO_RECEIPT'},403);
          const file=await env.RECORD_STORE.get(filename);
          if(!file)return json({status:'UNKNOWN',reason:'ARTIFACT_NOT_FOUND'},404);
          if(file.size>524288)return json({status:'UNKNOWN',reason:'ARTIFACT_EXCEEDS_MCP_LIMIT'},413);
          const bytes=await file.arrayBuffer();
          if(bytes.byteLength>524288)return json({status:'UNKNOWN',reason:'ARTIFACT_EXCEEDS_MCP_LIMIT'},413);
          const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
            .map(v=>v.toString(16).padStart(2,'0')).join('');
          const type=filename.endsWith('.png')?'image/png':
            filename.endsWith('.js')?'text/javascript; charset=utf-8':
            filename.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';
          return new Response(bytes,{status:200,headers:{
            'content-type':type,'cache-control':'no-store',
            'x-factory-artifact-sha256':digest,
            'x-factory-receipt-id':id,
            'x-factory-source-sha':back.sourceSha,
            'x-content-type-options':'nosniff'}});
        } catch {
          return json({status:'DENIED',reason:'INVALID_GO_ARTIFACT_REQUEST'},400);
        }
      }

      // A restricted evidence-only recovery for an interrupted Pantheon LOGIC handoff.
      // This route NEVER calls a domain runner or repeats a machine effect.
      if (request.method === 'POST' && url.pathname === '/station/reconcile') {
        if (!runtime) return json({status:'UNKNOWN',reason:'DURABLE_STORAGE_NOT_CONFIGURED'},503);
        const authenticated=await authenticateRailRequest(request,env);
        if (!authenticated.ok) return json({status:'DENIED',reason:authenticated.reason},authenticated.status);
        if (authenticated.principal !== 'PANTHEON')
          return json({status:'DENIED',reason:'PANTHEON_RAIL_REQUIRED'},403);
        try {
          const input=JSON.parse(authenticated.body);
          if(input?.workId===L1_TASK_ID && input.intent!==L1_INTENT)throw Error('L1_TASK_RESERVED');
          validatePantheonHandoff(input);
          if(input.intent===L1_INTENT){const result=await l1.reconcile(input);return json(result,result.status==='UNKNOWN'?409:200);}
          const result=await runtime.reconcile(input);
          return json(result, result.status==='UNKNOWN'?409:200);
        }catch(error){
          const reason=error.code||error.message;
          return json({status:'UNKNOWN',reason},reason==='FACTORY_WORK_SCOPE_CONFLICT'?409:400);
        }
      }

      if (request.method === 'GET' && url.pathname.startsWith('/station/readback/')) {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);

        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok) {
          logRailReject({ phase: 'readback', reason: authenticated.reason });
          return json({ status: 'DENIED', reason: authenticated.reason }, authenticated.status);
        }

        const receiptId = decodeURIComponent(url.pathname.slice('/station/readback/'.length));
        if(receiptId===L1_RECEIPT_ID){
          if(authenticated.principal!=='PANTHEON')return json({status:'DENIED',reason:'PANTHEON_RAIL_REQUIRED'},403);
          try{const result=await l1.readback();return json(result,result.reason==='RECEIPT_NOT_FOUND'?404:200);}
          catch{return json({status:'UNKNOWN',reason:'L1_DURABLE_EVIDENCE_MISMATCH'},409);}
        }
        const result = await runtime.readback(receiptId);
        // Direct GO artifacts are private to the dedicated GO rail. Preserve
        // CITY's existing access to CITY receipts without exposing GO jobs.
        if (authenticated.principal === 'CITY' && result.originSystem === 'go-together')
          return json({status:'DENIED',reason:'GO_RECEIPT_REQUIRES_GO_RAIL'},403);
        if (authenticated.principal === 'GO' && result.reason !== 'RECEIPT_NOT_FOUND'
          && (result.actingActor !== 'GO' || result.authorizationSource !== 'WORK_PASS' || result.originSystem !== 'go-together')) {
          return json({status:'DENIED',reason:'GO_RAIL_READBACK_DENIED'},403);
        }
        if (authenticated.principal === 'PANTHEON' && result.reason !== 'RECEIPT_NOT_FOUND'
          && (result.actingActor !== 'PANTHEON'
            || !/^task_[a-f0-9]{32}$/.test(result.workId || '')
            || result.workPassRef !== `work-pass://pantheon-${result.workId}`)) {
          return json({ status: 'DENIED', reason: 'PANTHEON_RAIL_READBACK_DENIED' }, 403);
        }
        return json(result, result.reason === 'RECEIPT_NOT_FOUND' ? 404 : 200);
      }

      return json({ status: 'UNKNOWN', reason: 'ROUTE_NOT_FOUND' }, 404);
    },
  });
}

export default {
  fetch(request, env) {
    const recordStore = env.RECORD_STORE ? createR2RecordStore(env.RECORD_STORE) : undefined;
    const runtimeEnv = { ...env, SOURCE_SHA: BUILD_SOURCE_SHA !== 'UNKNOWN' ? BUILD_SOURCE_SHA : env.SOURCE_SHA || 'UNKNOWN' };
    const domainRunners = recordStore ? { ...createConfiguredMachinery(env, recordStore) } : {};
    if (recordStore) domainRunners.LOGIC = createLogicDispatcher({ store: recordStore, runner: domainRunners.LOGIC });
    return createFactoryWorker(runtimeEnv, { recordStore, domainRunners }).fetch(request);
  },
};
