function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

export function createLogicRegistry({ store } = {}) {
  if (!store || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.append !== 'function' || typeof store.list !== 'function') throw new TypeError('logicRegistryStore_REQUIRED');
  return Object.freeze({
    async register({ logicId, version, manifest, ownerSystem = 'LOGIC' }) {
      const id = requiredString(logicId, 'logicId');
      const key = `logic/registry/${id}`;
      return store.put(key, { logicId: id, version: requiredString(version, 'version'), manifest, ownerSystem, registeredAt: new Date().toISOString() }, { expectedVersion: 0 });
    },
    async get(logicId) { return store.get(`logic/registry/${requiredString(logicId, 'logicId')}`); },
    async recordHealth({ logicId, version, status, evidenceRef, observedAt }) {
      return store.append(`logic/health/${requiredString(logicId, 'logicId')}`, { logicId, version, status, evidenceRef, observedAt });
    },
    async recordFieldResult({ logicId, version, result, evidenceRef, observedAt }) {
      return store.append(`logic/field/${requiredString(logicId, 'logicId')}`, { logicId, version, result, evidenceRef, observedAt });
    },
    async healthHistory(logicId) { return store.list(`logic/health/${requiredString(logicId, 'logicId')}`); },
    async fieldResults(logicId) { return store.list(`logic/field/${requiredString(logicId, 'logicId')}`); },
  });
}
