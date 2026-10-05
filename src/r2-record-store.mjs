import { createDurableStore } from './durable-store.mjs';

const capabilities = Object.freeze({
  durable: true,
  atomicCompareAndSet: true,
  appendOnlyEvents: true,
  readAfterWrite: true,
});

function encode(value) { return JSON.stringify(value); }
async function decodeObject(object) { return object ? JSON.parse(await object.text()) : null; }
function recordKey(key) { return `records/${key}`; }
function eventPrefix(stream) { return `events/${stream}/`; }

export function createR2DurableDriver(bucket, { idFactory = () => crypto.randomUUID(), clock = () => new Date().toISOString() } = {}) {
  if (!bucket || typeof bucket.get !== 'function' || typeof bucket.put !== 'function' || typeof bucket.list !== 'function') {
    throw new TypeError('R2_BUCKET_REQUIRED');
  }
  return Object.freeze({
    capabilities,
    async get(key) {
      return decodeObject(await bucket.get(recordKey(key)));
    },
    async put(key, value, { expectedVersion = null } = {}) {
      const objectKey = recordKey(key);
      const currentObject = await bucket.get(objectKey);
      const current = await decodeObject(currentObject);
      if (expectedVersion !== null && (current?.version || 0) !== expectedVersion) throw new Error('DURABLE_CONFLICT');
      const next = { key, version: (current?.version || 0) + 1, value };
      const onlyIf = currentObject?.etag
        ? { etagMatches: currentObject.etag }
        : expectedVersion === 0 ? { etagDoesNotMatch: '*' } : undefined;
      const result = await bucket.put(objectKey, encode(next), onlyIf ? { onlyIf } : undefined);
      if (!result) throw new Error('DURABLE_CONFLICT');
      return next;
    },
    async append(stream, value) {
      const prefix = eventPrefix(stream);
      const key = `${prefix}${clock()}-${idFactory()}.json`;
      const event = { stream, eventId: key.slice(prefix.length, -5), value };
      await bucket.put(key, encode(event), { onlyIf: { etagDoesNotMatch: '*' } });
      return event;
    },
    async list(stream) {
      const prefix = eventPrefix(stream);
      const listed = await bucket.list({ prefix });
      const events = await Promise.all(listed.objects.map(async ({ key }) => decodeObject(await bucket.get(key))));
      return events.filter(Boolean).sort((a, b) => a.eventId.localeCompare(b.eventId)).map((event, index) => ({ ...event, sequence: index + 1 }));
    },
  });
}

export function createR2RecordStore(bucket, options) {
  return createDurableStore({ driver: createR2DurableDriver(bucket, options) });
}
