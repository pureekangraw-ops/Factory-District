import { createPortEnvelope } from './provider-port.mjs';
import { travelRail } from './rail-link.mjs';
import { verifyDeploymentBinding } from './deployment-binding.mjs';

export async function runProductionIntegration({ link, port, workId, operation, payload, domain, machineId, authorityRef, dispatch, readback, binding, runtimeReadback } = {}) {
  const envelope = createPortEnvelope({ workId, portId: port.portId, operation, payload });
  const railResult = await travelRail({ link, envelope: { ...envelope, domain, machineId, authorityRef, work: { workId } }, dispatch, readback });
  const deployment = binding && runtimeReadback ? verifyDeploymentBinding({ expectedSourceSha: binding.sourceSha, binding, runtimeReadback }) : null;
  return Object.freeze({ rail: railResult, deployment, verified: railResult.outcome === 'VERIFIED' && (!deployment || deployment.status === 'PASS') });
}
