import { createFactoryRuntime } from './factory-runtime.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function defaultHandlers() {
  return Object.fromEntries(['CODE', 'VISUAL', 'LOGIC'].map((domain) => [domain, async ({ handoff }) => ({
    ownerDomain: domain,
    status: 'RECEIVED',
    completed: false,
    workId: handoff.workId,
    message: 'Factory boundary handoff verified; domain execution is not claimed by the foundation skeleton.',
  })]));
}

export function createFactoryWorker(env = {}) {
  const runtime = createFactoryRuntime({
    sourceSha: env.SOURCE_SHA || env.COMMIT_SHA || 'UNKNOWN',
    domainHandlers: defaultHandlers(),
  });

  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') return json(runtime.health());
      if (request.method === 'POST' && url.pathname === '/station/receive') {
        try {
          const result = await runtime.receive(await request.json());
          const status = result.receipt.status === 'DENIED' ? 403 : result.receipt.status === 'UNKNOWN' ? 409 : 202;
          return json(result, status);
        } catch (error) {
          return json({ status: 'DENIED', reason: error.code || error.message }, 400);
        }
      }
      if (request.method === 'GET' && url.pathname.startsWith('/station/readback/')) {
        const receiptId = decodeURIComponent(url.pathname.slice('/station/readback/'.length));
        const result = runtime.readback(receiptId);
        return json(result, result.reason === 'RECEIPT_NOT_FOUND' ? 404 : 200);
      }
      return json({ status: 'UNKNOWN', reason: 'ROUTE_NOT_FOUND' }, 404);
    },
  });
}

export default {
  fetch(request, env) {
    return createFactoryWorker(env).fetch(request);
  },
};
