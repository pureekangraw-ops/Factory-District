export const BINDING_STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' });

function requiredString(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`); return value.trim(); }

export function createDeploymentBinding({ sourceSha, deploymentRef, destinationRef, observedAt } = {}) { return Object.freeze({ kind: 'DEPLOYMENT_BINDING', sourceSha: requiredString(sourceSha, 'sourceSha'), deploymentRef: requiredString(deploymentRef, 'deploymentRef'), destinationRef: requiredString(destinationRef, 'destinationRef'), observedAt: requiredString(observedAt, 'observedAt') }); }

export function verifyDeploymentBinding({ expectedSourceSha, binding, runtimeReadback } = {}) {
  if (!binding || !runtimeReadback || !expectedSourceSha) return { status: BINDING_STATUS.UNKNOWN, reason: 'BINDING_INPUT_INCOMPLETE' };
  if (binding.sourceSha !== expectedSourceSha) return { status: BINDING_STATUS.UNKNOWN, reason: 'DEPLOYMENT_SOURCE_SHA_MISMATCH' };
  if (runtimeReadback.deploymentRef !== binding.deploymentRef || runtimeReadback.destinationRef !== binding.destinationRef) return { status: BINDING_STATUS.UNKNOWN, reason: 'RUNTIME_DESTINATION_MISMATCH' };
  if (runtimeReadback.runtimeSha !== expectedSourceSha) return { status: BINDING_STATUS.UNKNOWN, reason: 'RUNTIME_SOURCE_SHA_MISMATCH', observedSha: runtimeReadback.runtimeSha };
  if (!['READY', 'HEALTHY', 'PASS'].includes(runtimeReadback.health)) return { status: BINDING_STATUS.UNKNOWN, reason: 'RUNTIME_HEALTH_UNVERIFIED' };
  return { status: BINDING_STATUS.PASS, reason: 'SOURCE_DEPLOYMENT_RUNTIME_MATCH', evidenceRef: `evidence://binding/${binding.deploymentRef}/${expectedSourceSha}` };
}
