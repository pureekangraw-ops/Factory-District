import { assertVisualAdapter, VISUAL_ADAPTER_METHODS, VISUAL_MODE, VISUAL_TARGET } from './visual-contract.mjs';

function createAdapter(target, provider, mode = VISUAL_MODE.MENU) {
  if (!provider || typeof provider !== 'object') throw new TypeError('provider_REQUIRED');
  for (const method of VISUAL_ADAPTER_METHODS) {
    if (typeof provider[method] !== 'function') throw new TypeError(`provider.${method}_REQUIRED`);
  }
  const adapter = { target, mode };
  for (const method of VISUAL_ADAPTER_METHODS) adapter[method] = (input) => provider[method](input);
  return Object.freeze(assertVisualAdapter(adapter));
}

export function createUiWebAdapter(provider, mode = VISUAL_MODE.MENU) { return createAdapter(VISUAL_TARGET.UI_WEB, provider, mode); }
export function createHeroImageAdapter(provider, mode = VISUAL_MODE.MENU) { return createAdapter(VISUAL_TARGET.HERO_IMAGE, provider, mode); }
export function createWallpaperAdapter(provider, mode = VISUAL_MODE.MENU) { return createAdapter(VISUAL_TARGET.WALLPAPER, provider, mode); }
export function createIconAdapter(provider, mode = VISUAL_MODE.MENU) { return createAdapter(VISUAL_TARGET.ICON, provider, mode); }
export function createPresentationMockupAdapter(provider, mode = VISUAL_MODE.MENU) { return createAdapter(VISUAL_TARGET.PRESENTATION_MOCKUP, provider, mode); }
