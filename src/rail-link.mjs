export const RAIL_LINK_VERSION = '0.1.0';

function requiredString(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`); return value.trim(); }

export function createBilateralRailLink({ linkId, trustBoundaryRef, endpoints } = {}) {
  if (!Array.isArray(endpoints) || endpoints.length !== 2) throw new Error('RAIL_LINK_REQUIRES_EXACTLY_TWO_ENDPOINTS');
  const normalized = endpoints.map((endpoint, index) => Object.freeze({ endpointId: requiredString(endpoint.endpointId, `endpoints[${index}].endpointId`), systemId: requiredString(endpoint.systemId, `endpoints[${index}].systemId`), surfaceId: requiredString(endpoint.surfaceId, `endpoints[${index}].surfaceId`) }));
  if (normalized[0].endpointId === normalized[1].endpointId) throw new Error('RAIL_LINK_ENDPOINTS_MUST_BE_DISTINCT');
  return Object.freeze({ kind: 'BILATERAL_RAIL_LINK', contractVersion: RAIL_LINK_VERSION, linkId: requiredString(linkId, 'linkId'), trustBoundaryRef: requiredString(trustBoundaryRef, 'trustBoundaryRef'), endpoints: Object.freeze(normalized) });
}

export async function travelRail({ link, envelope, dispatch, readback } = {}) {
  if (!link?.endpoints || link.endpoints.length !== 2) throw new Error('BILATERAL_LINK_REQUIRED');
  if (typeof dispatch !== 'function' || typeof readback !== 'function') throw new TypeError('dispatch_and_readback_REQUIRED');
  const oathId = envelope?.oathId || `oath-${Date.now()}`;
  let receipt;
  try { receipt = await dispatch({ oathId, link, envelope }); } catch (error) { return { outcome: 'FAILED', failure: { stage: 'TRANSPORT', code: error.code || 'DISPATCH_ERROR', message: error.message } }; }
  if (!receipt?.accepted) return { outcome: 'FAILED', failure: { stage: 'DESTINATION', code: receipt?.reason || 'DESTINATION_REJECTED', message: 'Destination did not accept envelope' }, receipt };
  let observed;
  try { observed = await readback({ oathId, link, envelope, receipt }); } catch (error) { return { outcome: 'UNKNOWN', receipt, failure: { stage: 'READBACK', code: error.code || 'READBACK_ERROR', message: error.message } }; }
  if (observed?.verified !== true) return { outcome: 'UNKNOWN', receipt, readback: observed, failure: { stage: 'READBACK', code: 'READBACK_NOT_VERIFIED', message: 'Rail receipt lacks verified destination readback' } };
  return { outcome: 'VERIFIED', oathId, receipt, readback: observed, evidenceRef: observed.evidenceRef || null };
}
