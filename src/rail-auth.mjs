export const FACTORY_STATION_PROTOCOL = 'METROPOLIS_FACTORY_STATION_V2';
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const text = value => String(value ?? '').trim();

function fromHex(value) {
  const normalized = text(value).toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2) return null;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifyHmac({ body, secret, timestamp, signature }) {
  const provided = fromHex(signature);
  if (!provided || !text(secret)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    provided,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
}

export function railTransportHealth(env = {}) {
  const configured = Boolean(text(env.METROPOLIS_FACTORY_RAIL_SECRET));
  return Object.freeze({
    status: configured ? 'READY' : 'NOT_CONFIGURED',
    protocol: FACTORY_STATION_PROTOCOL,
    authentication: 'HMAC_SHA256',
    maxClockSkewMs: MAX_CLOCK_SKEW_MS,
  });
}

export async function authenticateRailRequest(request, env = {}, {
  nowMs = () => Date.now(),
} = {}) {
  const secret = text(env.METROPOLIS_FACTORY_RAIL_SECRET);
  if (!secret) return { ok: false, status: 503, reason: 'FACTORY_RAIL_SECRET_NOT_CONFIGURED' };

  const protocol = text(request.headers.get('x-metropolis-factory-protocol'));
  if (protocol !== FACTORY_STATION_PROTOCOL) {
    return { ok: false, status: 400, reason: 'FACTORY_RAIL_PROTOCOL_INVALID' };
  }

  const timestamp = text(request.headers.get('x-metropolis-factory-timestamp'));
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp) || Math.abs(nowMs() - numericTimestamp) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, status: 401, reason: 'FACTORY_RAIL_TIMESTAMP_INVALID' };
  }

  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  const signature = text(request.headers.get('x-metropolis-factory-signature'));
  const verified = await verifyHmac({ body, secret, timestamp, signature });
  if (!verified) return { ok: false, status: 401, reason: 'FACTORY_RAIL_SIGNATURE_INVALID' };

  return { ok: true, body };
}
