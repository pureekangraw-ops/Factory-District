import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderPort, createPortEnvelope, normalizePortSnapshot } from '../src/provider-port.mjs';
import { createDeploymentBinding, verifyDeploymentBinding } from '../src/deployment-binding.mjs';
import { createBilateralRailLink } from '../src/rail-link.mjs';
import { runProductionIntegration } from '../src/production-integration.mjs';

test('Provider Port exposes capability evidence without exposing credentials', () => { const port = createProviderPort({ portId: 'GITHUB-PORT', systemId: 'GITHUB', credentialRef: 'credential://github/factory', capabilities: ['READ_REPOSITORY', 'CREATE_BRANCH'] }); const snapshot = normalizePortSnapshot(port, { status: 'READY', verifiedCapabilities: ['READ_REPOSITORY'], observedAt: 'now' }); assert.equal(snapshot.capabilities.READ_REPOSITORY.status, 'READY'); assert.equal(snapshot.capabilities.CREATE_BRANCH.status, 'UNKNOWN'); assert.equal(snapshot.credentialBoundary.exposed, false); assert.throws(() => createPortEnvelope({ workId: 'W', portId: port.portId, operation: 'READ', payload: { token: 'secret' } }), /MUST_NOT_CARRY_CREDENTIALS/); });

test('Deployment binding requires source, deployment, destination and runtime SHA match', () => { const binding = createDeploymentBinding({ sourceSha: 'sha-1', deploymentRef: 'deploy-1', destinationRef: 'worker-prod', observedAt: 'now' }); assert.equal(verifyDeploymentBinding({ expectedSourceSha: 'sha-1', binding, runtimeReadback: { deploymentRef: 'deploy-1', destinationRef: 'worker-prod', runtimeSha: 'sha-1', health: 'HEALTHY' } }).status, 'PASS'); assert.equal(verifyDeploymentBinding({ expectedSourceSha: 'sha-1', binding, runtimeReadback: { deploymentRef: 'deploy-1', destinationRef: 'worker-prod', runtimeSha: 'stale', health: 'HEALTHY' } }).status, 'UNKNOWN'); });

test('Production integration requires bilateral Rail and verified runtime binding', async () => { const port = createProviderPort({ portId: 'CLOUDFLARE-PORT', systemId: 'CLOUDFLARE', credentialRef: 'credential://cloudflare/factory', capabilities: ['DEPLOY_WORKER'] }); const link = createBilateralRailLink({ linkId: 'METRO-FACTORY', trustBoundaryRef: 'TB', endpoints: [{ endpointId: 'METRO', systemId: 'METROPOLIS', surfaceId: 'STATION-A' }, { endpointId: 'FACTORY', systemId: 'FACTORY', surfaceId: 'STATION-B' }] }); const binding = createDeploymentBinding({ sourceSha: 'sha-1', deploymentRef: 'deploy-1', destinationRef: 'worker-prod', observedAt: 'now' }); const result = await runProductionIntegration({ link, port, workId: 'WORK-1', operation: 'READ_RUNTIME', payload: {}, domain: 'CODE', machineId: 'CODE-MACHINE', authorityRef: 'AUTH', binding, runtimeReadback: { deploymentRef: 'deploy-1', destinationRef: 'worker-prod', runtimeSha: 'sha-1', health: 'HEALTHY' }, dispatch: async () => ({ accepted: true, receiptId: 'receipt-1' }), readback: async () => ({ verified: true, evidenceRef: 'evidence://rail-1' }) }); assert.equal(result.verified, true); assert.equal(result.deployment.status, 'PASS'); });


test('production integration fails closed when deployment binding/readback is missing', async () => {
  const port = createProviderPort({ portId: 'CLOUDFLARE-PORT', systemId: 'CLOUDFLARE', credentialRef: 'credential://cloudflare/factory', capabilities: ['DEPLOY_WORKER'] });
  const link = createBilateralRailLink({ linkId: 'METRO-FACTORY', trustBoundaryRef: 'TB', endpoints: [{ endpointId: 'METRO', systemId: 'METROPOLIS', surfaceId: 'STATION-A' }, { endpointId: 'FACTORY', systemId: 'FACTORY', surfaceId: 'STATION-B' }] });
  const result = await runProductionIntegration({ link, port, workId: 'WORK-MISSING-BINDING', operation: 'READ_RUNTIME', payload: {}, domain: 'CODE', machineId: 'CODE-MACHINE', authorityRef: 'AUTH', dispatch: async () => ({ accepted: true, receiptId: 'receipt-missing' }), readback: async () => ({ verified: true, evidenceRef: 'evidence://rail-missing' }) });
  assert.equal(result.rail.outcome, 'VERIFIED');
  assert.equal(result.deployment.status, 'UNKNOWN');
  assert.equal(result.deployment.reason, 'DEPLOYMENT_BINDING_REQUIRED');
  assert.equal(result.verified, false);
});
