import { createR2RecordStore } from './r2-record-store.mjs';
import { createFactoryRuntime } from './factory-runtime.mjs';
import { createPixieOperator } from './pixie-autonomous.mjs';
import { BUILD_SOURCE_SHA } from './build-source-identity.mjs';
import { authenticateRailRequest, railTransportHealth } from './rail-auth.mjs';

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
    const verified = execution.status === 'RETURNED' && run?.workId === handoff.workId
      && Boolean(run.verificationRef) && Boolean(run.returnRef)
      && Array.isArray(run.evidenceRefs) && run.evidenceRefs.length > 0
      && run.evidenceRefs.every(ref => typeof ref === 'string' && ref.trim());
    return { status: verified ? 'RETURNED' : 'UNKNOWN', reason: verified ? null : 'MACHINE_RESULT_UNVERIFIED', completed: Boolean(verified), machineResult: result || null, execution };
  }]));
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

      if (request.method === 'POST' && url.pathname === '/station/receive') {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);

        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok) return json({ status: 'DENIED', reason: authenticated.reason }, authenticated.status);

        try {
          const result = await runtime.receive(JSON.parse(authenticated.body));
          const status = result.receipt.status === 'DENIED' ? 403 : result.receipt.status === 'UNKNOWN' ? 409 : 202;
          return json(result, status);
        } catch (error) {
          return json({ status: 'DENIED', reason: error.code || error.message }, 400);
        }
      }

      if (request.method === 'GET' && url.pathname.startsWith('/station/readback/')) {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);

        const authenticated = await authenticateRailRequest(request, env);
        if (!authenticated.ok) return json({ status: 'DENIED', reason: authenticated.reason }, authenticated.status);

        const receiptId = decodeURIComponent(url.pathname.slice('/station/readback/'.length));
        const result = await runtime.readback(receiptId);
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
    return createFactoryWorker(runtimeEnv, { recordStore }).fetch(request);
  },
};
