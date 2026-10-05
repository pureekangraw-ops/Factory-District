export const VISUAL_CONTRACT_VERSION = '0.1.0';

export const VISUAL_TARGET = Object.freeze({
  UI_WEB: 'UI_WEB',
  HERO_IMAGE: 'HERO_IMAGE',
  WALLPAPER: 'WALLPAPER',
  ICON: 'ICON',
  PRESENTATION_MOCKUP: 'PRESENTATION_MOCKUP',
});

export const VISUAL_MODE = Object.freeze({ MENU: 'MENU', MANUAL: 'MANUAL' });

export const VISUAL_STEP = Object.freeze({
  INPUT_INSPECT: 'INPUT_INSPECT',
  INTERPRET: 'INTERPRET',
  COMPOSE: 'COMPOSE',
  CREATE_EDIT: 'CREATE_EDIT',
  RENDER: 'RENDER',
  VISUAL_INSPECT: 'VISUAL_INSPECT',
  COMPARE: 'COMPARE',
  CORRECT: 'CORRECT',
  EXPORT: 'EXPORT',
  FINAL_OUTPUT_VERIFY: 'FINAL_OUTPUT_VERIFY',
  VERSION_GATE: 'VERSION_GATE',
  RETURN: 'RETURN',
});

export const VISUAL_STATUS = Object.freeze({ PASS: 'PASS', READY: 'READY', NEEDS_CORRECTION: 'NEEDS_CORRECTION', FAIL: 'FAIL', UNKNOWN: 'UNKNOWN' });

export const VISUAL_ADAPTER_METHODS = Object.freeze([
  'inspectInput',
  'interpretDesign',
  'compose',
  'createOrEdit',
  'render',
  'inspectVisual',
  'compare',
  'correct',
  'exportOutput',
  'verifyFinalOutput',
]);

export function assertVisualAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('visualAdapter_REQUIRED');
  if (!Object.values(VISUAL_TARGET).includes(adapter.target)) throw new TypeError('visualAdapter.target_INVALID');
  if (!Object.values(VISUAL_MODE).includes(adapter.mode)) throw new TypeError('visualAdapter.mode_INVALID');
  for (const method of VISUAL_ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`visualAdapter.${method}_REQUIRED`);
  }
  return adapter;
}
