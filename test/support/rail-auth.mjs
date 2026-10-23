import { FACTORY_STATION_PROTOCOL } from '../../src/rail-auth.mjs';

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sign({ body, secret, timestamp }) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  ));
}

export async function railRequest(url, {
  method = 'GET',
  body = '',
  secret = 'test-rail-secret',
  timestamp = String(Date.now()),
  headers = {},
} = {}) {
  const normalizedBody = method === 'GET' || method === 'HEAD' ? '' : body;
  const signature = await sign({ body: normalizedBody, secret, timestamp });
  return new Request(url, {
    method,
    headers: {
      ...headers,
      'x-metropolis-factory-protocol': FACTORY_STATION_PROTOCOL,
      'x-metropolis-factory-timestamp': timestamp,
      'x-metropolis-factory-signature': signature,
    },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: normalizedBody }),
  });
}
