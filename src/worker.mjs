import { createR2RecordStore } from './r2-record-store.mjs';
import { createFactoryRuntime } from './factory-runtime.mjs';
import { createPixieOperator } from './pixie-autonomous.mjs';
import { BUILD_SOURCE_SHA } from './build-source-identity.mjs';
import { authenticateRailRequest, railTransportHealth, validatePantheonHandoff } from './rail-auth.mjs';
import { createDwarfLogicTraineeRunner } from './dwarf-logic-trainee.mjs';

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

  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return json(runtime
          ? {
              ...runtime.health(),
              transport,
              machinery: Object.fromEntries(['CODE', 'VISUAL', 'LOGIC'].map(domain => [domain, {
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
          if (authenticated.principal === 'PANTHEON') validatePantheonHandoff(input);
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
          if (authenticated.principal === 'PANTHEON') validatePantheonHandoff(input);
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
          validatePantheonHandoff(input);
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
        const result = await runtime.readback(receiptId);
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
    const domainRunners = recordStore ? { LOGIC: createDwarfLogicTraineeRunner({ store: recordStore }) } : {};
    return createFactoryWorker(runtimeEnv, { recordStore, domainRunners }).fetch(request);
  },
};
