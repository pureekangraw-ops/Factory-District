import {L1_INTENT,validateL1Fields} from './l1-runtime.mjs';
import {L1_TASK_ID} from './l1-text-artifact.mjs';
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
  // Independent PANTHEON credential; never share or rotate the City rail key.
  const client = request.headers.get('x-factory-client');
  const principal = client === 'PANTHEON' ? 'PANTHEON' : client === 'GO' ? 'GO' : 'CITY';
  const secret = text(principal === 'PANTHEON' ? env.PANTHEON_FACTORY_RAIL_SECRET
    : principal === 'GO' ? env.GO_FACTORY_RAIL_SECRET : env.METROPOLIS_FACTORY_RAIL_SECRET);
  // GO requires its own 256-bit key; inert placeholders must not authorize calls.
  if (principal === 'GO' && !/^[a-f0-9]{64}$/i.test(secret))
    return { ok: false, status: 503, reason: 'GO_FACTORY_RAIL_KEY_NOT_CONFIGURED' };
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

  return { ok: true, body, principal };
}

export function validatePantheonHandoff(input) {
  const l1=input?.intent===L1_INTENT;
  if(l1)validateL1Fields(input);
  const task = input?.workId;
  const pass = input?.workPass;
  const isTask = typeof task === 'string' && /^task_[a-f0-9]{32}$/.test(task);
  const expectedCheckpoint = isTask ? `cp-${task}` : null;
  const allowed = isTask && input.checkpointId === expectedCheckpoint
    && (l1 || (task!==L1_TASK_ID && input.ownerDomain === 'LOGIC' && input.intent === 'PLACE_DWARF_LOGIC_TRAINEE'
    && Array.isArray(input.scope) && input.scope.length === 1 && input.scope[0] === 'EXECUTE:LOGIC'))
    && Array.isArray(input.inputRefs) && input.inputRefs.length === 0
    && input.source?.stationId === 'PANTHEON' && input.source?.system === 'pantheon-workhub'
    && input.target?.stationId === 'FACTORY-STATION'
    && input.target?.system === 'factory-district' && input.target?.component === 'FACTORY_HALL'
    && input.workPassRef === `work-pass://pantheon-${task}`
    && pass?.kind === 'WORK_PASS' && pass.version === 'WORK_PASS_V1'
    && pass.status === 'ACTIVE' && pass.passId === `pantheon-${task}`
    && pass.actor === 'PANTHEON' && pass.workId === task && pass.checkpointId === expectedCheckpoint
    && Array.isArray(pass.permissions?.actions)
    && pass.permissions.actions.length === 1 && pass.permissions.actions[0] === 'handoff'
    && Array.isArray(pass.permissions?.handoff) && pass.permissions.handoff.length === 1
    && pass.permissions.handoff[0]?.stationId === 'FACTORY_STATION'
    && pass.authorityTransferred !== true
    && input.actingActor == null && input.cityAuthorization == null && input.operation == null;
  if (!allowed) {
    const error = new Error('PANTHEON_RAIL_SCOPE_DENIED');
    error.code = 'PANTHEON_RAIL_SCOPE_DENIED';
    throw error;
  }
  return input;
}

