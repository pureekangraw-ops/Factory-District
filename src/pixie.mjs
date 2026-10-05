import { createEvidence, FACTORY_DOMAINS, FACTORY_STATUS } from './contract.mjs';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

export function createPixie({ clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID(), handlers = {} } = {}) {
  async function execute(handoff, { sourceSha } = {}) {
    const domain = requiredString(handoff.ownerDomain, 'handoff.ownerDomain').toUpperCase();
    if (!FACTORY_DOMAINS.includes(domain)) return { status: FACTORY_STATUS.UNKNOWN, reason: 'OWNER_DOMAIN_UNKNOWN' };
    if (!handoff.scope.includes(`EXECUTE:${domain}`)) return { status: FACTORY_STATUS.DENIED, reason: 'SCOPE_NOT_GRANTED' };
    const handler = handlers[domain];
    if (typeof handler !== 'function') return { status: FACTORY_STATUS.UNKNOWN, reason: 'DESTINATION_UNAVAILABLE' };
    let result;
    try {
      result = await handler({ handoff, pixie: 'PIXIE' });
    } catch (error) {
      return { status: FACTORY_STATUS.UNKNOWN, reason: 'DESTINATION_ERROR', error: error.code || error.message };
    }
    const evidenceRef = `evidence://factory/${encodeURIComponent(handoff.workId)}/${encodeURIComponent(handoff.checkpointId)}/${idFactory()}`;
    const observedAt = clock();
    const evidence = createEvidence({
      evidenceRef,
      handoff,
      observedAt,
      sourceSha: sourceSha || 'UNKNOWN',
      verificationKind: 'BOUNDARY_HANDOFF',
      details: { pixie: 'PIXIE', ownerResult: result },
    });
    return { status: FACTORY_STATUS.VERIFIED, result, evidence };
  }

  return Object.freeze({ execute });
}
