export const DURABLE_STORE_METHODS = Object.freeze(['get', 'put', 'append', 'list']);

export const DURABLE_STORE_REQUIREMENTS = Object.freeze({
  durable: true,
  atomicCompareAndSet: true,
  appendOnlyEvents: true,
  readAfterWrite: true,
});

export function assertDurableStore(store) {
  if (!store || typeof store !== 'object') throw new TypeError('durableStore_REQUIRED');
  for (const method of DURABLE_STORE_METHODS) {
    if (typeof store[method] !== 'function') throw new TypeError(`durableStore.${method}_REQUIRED`);
  }
  for (const [name, required] of Object.entries(DURABLE_STORE_REQUIREMENTS)) {
    if (store.capabilities?.[name] !== required) throw new Error(`durableStore.${name}_REQUIRED`);
  }
  return store;
}

export function createDurableStore({ driver } = {}) {
  assertDurableStore(driver);
  return Object.freeze({
    capabilities: Object.freeze({ ...driver.capabilities }),
    get: (key) => driver.get(key),
    put: (key, value, options = {}) => driver.put(key, value, options),
    append: (stream, value) => driver.append(stream, value),
    list: (stream, query = {}) => driver.list(stream, query),
  });
}
