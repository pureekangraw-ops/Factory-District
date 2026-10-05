import { createR2RecordStore } from './r2-record-store.mjs';
import { createFactoryRuntime } from './factory-runtime.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function defaultHandlers() {
  return Object.fromEntries(['CODE', 'VISUAL', 'LOGIC'].map((domain) => [domain, async ({ handoff }) => ({ ownerDomain: domain, status: 'RECEIVED', completed: false, workId: handoff.workId, message: 'Factory boundary handoff verified; domain execution is not claimed by the foundation skeleton.' })]));
}

export function createFactoryWorker(env = {}, { recordStore } = {}) {
  const runtime = recordStore ? createFactoryRuntime({ sourceSha: env.SOURCE_SHA || env.COMMIT_SHA || 'UNKNOWN', domainHandlers: defaultHandlers(), recordStore }) : null;
  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') return json(runtime ? runtime.health() : { service: 'factory-district', status: 'UNKNOWN', storage: { status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' } });
      if (request.method === 'POST' && url.pathname === '/station/receive') {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);
        try {
          const result = await runtime.receive(await request.json());
          const status = result.receipt.status === 'DENIED' ? 403 : result.receipt.status === 'UNKNOWN' ? 409 : 202;
          return json(result, status);
        } catch (error) {
          return json({ status: 'DENIED', reason: error.code || error.message }, 400);
        }
      }
      if (request.method === 'GET' && url.pathname.startsWith('/station/readback/')) {
        if (!runtime) return json({ status: 'UNKNOWN', reason: 'DURABLE_STORAGE_NOT_CONFIGURED' }, 503);
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
    const runtimeEnv = { ...env, SOURCE_SHA: env.SOURCE_SHA || env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id || 'UNKNOWN' };
    return createFactoryWorker(runtimeEnv, { recordStore }).fetch(request);
  },
};
