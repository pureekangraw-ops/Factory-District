export function createInMemoryDurableDriver() {
  const records = new Map();
  const streams = new Map();
  return {
    capabilities: { durable: true, atomicCompareAndSet: true, appendOnlyEvents: true, readAfterWrite: true },
    async get(key) { return records.get(key) ? structuredClone(records.get(key)) : null; },
    async put(key, value, { expectedVersion = null } = {}) {
      const current = records.get(key);
      if (expectedVersion !== null && (current?.version || 0) !== expectedVersion) throw new Error('DURABLE_CONFLICT');
      const next = { key, version: (current?.version || 0) + 1, value: structuredClone(value) };
      records.set(key, next);
      return structuredClone(next);
    },
    async append(stream, value) {
      const list = streams.get(stream) || [];
      const next = { stream, sequence: list.length + 1, value: structuredClone(value) };
      list.push(next);
      streams.set(stream, list);
      return structuredClone(next);
    },
    async list(stream) { return structuredClone(streams.get(stream) || []); },
  };
}
