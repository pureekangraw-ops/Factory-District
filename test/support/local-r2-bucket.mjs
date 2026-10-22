// Synthetic R2 API-shaped fixture. No Cloudflare/network access or real bucket.
export function createLocalR2Bucket() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async get(key) {
      const record = records.get(key);
      return record ? { etag: record.etag, text: async () => record.text } : null;
    },
    async put(key, text, { onlyIf } = {}) {
      const current = records.get(key);
      if (onlyIf?.etagDoesNotMatch === '*' && current) return null;
      if (onlyIf?.etagMatches && current?.etag !== onlyIf.etagMatches) return null;
      const record = { etag: `local-${++revision}`, text };
      records.set(key, record);
      return { etag: record.etag };
    },
    async list({ prefix }) {
      return { objects: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
}
