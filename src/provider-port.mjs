export const PORT_STATUS = Object.freeze({ READY: 'READY', DEGRADED: 'DEGRADED', DENIED: 'DENIED', UNAVAILABLE: 'UNAVAILABLE', UNKNOWN: 'UNKNOWN' });

function requiredString(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`); return value.trim(); }

export function createProviderPort({ portId, systemId, credentialRef, capabilities = [] } = {}) {
  const reference = requiredString(credentialRef, 'credentialRef');
  if (!reference.startsWith('credential://')) throw new TypeError('credentialRef_MUST_BE_REFERENCE');
  return Object.freeze({ kind: 'PROVIDER_PORT', portId: requiredString(portId, 'portId'), systemId: requiredString(systemId, 'systemId'), credentialRef: reference, capabilities: Object.freeze([...capabilities].map((capability) => requiredString(capability, 'capability'))) });
}

export function createPortEnvelope({ workId, portId, operation, payload = {} } = {}) {
  if (Object.hasOwn(payload, 'token') || Object.hasOwn(payload, 'secret') || Object.hasOwn(payload, 'credential')) throw new Error('PORT_ENVELOPE_MUST_NOT_CARRY_CREDENTIALS');
  return Object.freeze({ kind: 'PORT_ENVELOPE', workId: requiredString(workId, 'workId'), portId: requiredString(portId, 'portId'), operation: requiredString(operation, 'operation'), payload: Object.freeze({ ...payload }) });
}

export function normalizePortSnapshot(port, snapshot = {}) {
  const status = snapshot.status || PORT_STATUS.UNKNOWN;
  const verified = new Set(snapshot.verifiedCapabilities || []);
  return Object.freeze({ portId: port.portId, systemId: port.systemId, status, observedAt: snapshot.observedAt || null, connectivity: snapshot.connectivity || { status: PORT_STATUS.UNKNOWN }, capabilities: Object.fromEntries(port.capabilities.map((capability) => [capability, verified.has(capability) ? { status: PORT_STATUS.READY, reason: 'CAPABILITY_VERIFIED' } : { status: PORT_STATUS.UNKNOWN, reason: 'CAPABILITY_UNVERIFIED' }])), limits: snapshot.limits || { status: PORT_STATUS.UNKNOWN }, credentialBoundary: { reference: port.credentialRef, exposed: false } });
}
