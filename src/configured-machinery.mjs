import { createWorkshopRunner } from './logic-workshop-runner.mjs';
import { CODE_ADAPTER_METHODS } from './code-contract.mjs';
import { VISUAL_ADAPTER_METHODS } from './visual-contract.mjs';
import { createMachineKernel } from './machine-kernel.mjs';
import { createDurableMachinePersistence } from './durable-machine-persistence.mjs';
import { createNodeWebAdapter, createCloudflareWorkerAdapter } from './code-adapters.mjs';
import { createUiWebAdapter, createHeroImageAdapter, createWallpaperAdapter, createIconAdapter, createPresentationMockupAdapter } from './visual-adapters.mjs';
import { runCodeMachine } from './code-machine.mjs';
import { runVisualMachine } from './visual-machine.mjs';

function unknown(work, code) {
  return { retryable: false, failure: { code }, run: { workId: work.workId,
    checkpointId: work.checkpointId, executionState: 'UNKNOWN', returnState: 'UNKNOWN',
    verificationRef: null, returnRef: null, evidenceRefs: [] } };
}
function machineWork(work, domain) {
  return { ...work, machineId: `${domain}-MACHINE`, machineVersion: '0.1.0', domain,
    ingress: { systemId: work.source.system, surfaceType: 'STATION', surfaceId: work.source.stationId },
    destination: { systemId: work.target.system, surfaceType: 'OWNER', surfaceId: domain, ownerDomain: domain },
    transportRef: { kind: 'RAIL', linkId: `${work.source.stationId}:${work.target.stationId}`, trustBoundaryRef: work.workPassRef },
    requestedBy: { actorId: work.actingActor, authorityRef: work.workPassRef, requestedAt: work.requestedAt },
    subject: { subjectId: work.workId, subjectType: `${domain}_WORK`, ownerSystem: work.source.system, lifecycleAuthorityRef: work.workPassRef } };
}

// Providers are deployment-owned RPC/service objects, never URLs or credentials
// supplied in Work. No fallback provider, endpoint, permission or auto-deploy.
export function createConfiguredMachinery(env, recordStore) {
  const runners = {};
  const codeFactories = { NODE_WEB: createNodeWebAdapter, CLOUDFLARE_WORKER: createCloudflareWorkerAdapter };
  const visualFactories = { UI_WEB: createUiWebAdapter, HERO_IMAGE: createHeroImageAdapter,
    WALLPAPER: createWallpaperAdapter, ICON: createIconAdapter, PRESENTATION_MOCKUP: createPresentationMockupAdapter };
  for (const [domain, factory] of [['CODE',codeFactories[env.CODE_TARGET]],['VISUAL',visualFactories[env.VISUAL_TARGET]]]) {
    const provider = env[`${domain}_PROVIDER`];
    const factories = domain === 'CODE' ? codeFactories : visualFactories;
    if (!recordStore || !provider || !Object.hasOwn(factories, env[`${domain}_TARGET`])) continue;
    let adapter;
    const methods = domain === 'CODE' ? CODE_ADAPTER_METHODS : VISUAL_ADAPTER_METHODS;
    if (methods.some(method => typeof provider[method] !== 'function')) continue;
    const boundedProvider = Object.fromEntries(methods.map(method => [method, async input => {
      try { return await provider[method](input); }
      catch (cause) {
        const denied = cause?.code === 'AUTHORITY_DENIED' || cause?.authorityBoundary === true;
        throw Object.assign(new Error(denied ? 'AUTHORITY_DENIED' : 'PROVIDER_STEP_FAILED'), {
          code: denied ? 'AUTHORITY_DENIED' : 'PROVIDER_STEP_FAILED',
          failureClass: denied ? 'AUTHORITY_DENIED' : 'EXECUTION_ERROR',
          targetState: denied ? 'BLOCKED' : null,
        });
      }
    }]));
    try { adapter = factory(boundedProvider, env.VISUAL_MODE); } catch { continue; }
    runners[domain] = async ({ work, actorRef }) => {
      if (work.ownerDomain !== domain || work.intent !== `EXECUTE_${domain}`)
        return unknown(work,'MACHINE_INTENT_NOT_SUPPORTED');
      if (!Array.isArray(work.inputRefs) || work.inputRefs.length === 0
        || work.inputRefs.some(ref => typeof ref !== 'string' || !ref.trim()))
        return unknown(work,'MACHINE_INPUT_REFS_REQUIRED');
      if (!work.scope.includes(`EXECUTE:${domain}`)) return unknown(work,'SCOPE_NOT_GRANTED');
      // Existing CODE pipeline includes deployment; execute permission alone
      // does not authorize that effect. Refuse before any provider call.
      if (domain === 'CODE' && !work.scope.includes('DEPLOY:CODE'))
        return unknown(work,'DEPLOY_SCOPE_NOT_GRANTED');
      const persistence = createDurableMachinePersistence({ store: recordStore });
      const kernel = createMachineKernel({ persistence });
      return (domain === 'CODE' ? runCodeMachine : runVisualMachine)({
        kernel, adapter, work: machineWork(work,domain), actorRef });
    };
  }
  const workshopProvider=env.LOGIC_WORKSHOP_PROVIDER || (typeof env.CODE_PROVIDER?.workshopAuthorize==='function' && typeof env.CODE_PROVIDER?.workshopRunCase==='function' ? {authorize:input=>env.CODE_PROVIDER.workshopAuthorize(input),runCase:input=>env.CODE_PROVIDER.workshopRunCase(input)} : null);
  if (recordStore && typeof workshopProvider?.authorize === 'function'
    && typeof workshopProvider?.runCase === 'function') {
    runners.LOGIC = createWorkshopRunner({ store: recordStore, provider: workshopProvider });
  }
  return Object.freeze(runners);
}
