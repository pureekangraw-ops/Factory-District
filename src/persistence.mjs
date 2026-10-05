export const PERSISTENCE_METHODS = Object.freeze([
  'createRun',
  'loadRun',
  'transitionRun',
  'startAttempt',
  'appendHeartbeat',
  'recordFailure',
  'recordCancellation',
  'appendEvidence',
  'recordVerification',
  'recordReturn',
  'listAttempts',
  'listEvents',
  'listEvidence',
]);

export function assertPersistenceAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('persistence_REQUIRED');
  for (const method of PERSISTENCE_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`persistence.${method}_REQUIRED`);
  }
  return adapter;
}

export function persistenceError(error) {
  return Object.assign(new Error(error?.message || 'PERSISTENCE_ERROR'), { code: 'PERSISTENCE_ERROR', cause: error });
}
