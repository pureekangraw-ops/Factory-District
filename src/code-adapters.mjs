import { assertCodeAdapter, CODE_ADAPTER_METHODS, CODE_TARGET } from './code-contract.mjs';

function createAdapter(target, provider) {
  if (!provider || typeof provider !== 'object') throw new TypeError('provider_REQUIRED');
  for (const method of CODE_ADAPTER_METHODS) {
    if (typeof provider[method] !== 'function') throw new TypeError(`provider.${method}_REQUIRED`);
  }
  const adapter = { target };
  for (const method of CODE_ADAPTER_METHODS) adapter[method] = (input) => provider[method](input);
  return Object.freeze(assertCodeAdapter(adapter));
}

export function createNodeWebAdapter(provider) {
  return createAdapter(CODE_TARGET.NODE_WEB, provider);
}

export function createCloudflareWorkerAdapter(provider) {
  return createAdapter(CODE_TARGET.CLOUDFLARE_WORKER, provider);
}
