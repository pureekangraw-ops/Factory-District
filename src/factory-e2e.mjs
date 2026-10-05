import { assertDurableStore } from './durable-store.mjs';
import { createPixieOperator } from './pixie-autonomous.mjs';

function requiredString(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`); return value.trim(); }

export function createFactoryStationReceiver({ pixie, store, clock = () => new Date().toISOString() } = {}) {
  if (!pixie || typeof pixie.run !== 'function') throw new TypeError('pixie_REQUIRED');
  const durable = assertDurableStore(store);
  return Object.freeze({
    async dispatch({ envelope }) {
      const result = await pixie.run({ work: envelope.work, domain: envelope.domain, machineId: envelope.machineId, authorityRef: envelope.authorityRef });
      const receiptId = `factory-receipt-${requiredString(envelope.oathId, 'envelope.oathId')}`;
      const record = { receiptId, workId: envelope.work?.workId || null, pixieStatus: result.status, lifecycleStatus: result.lifecycleStatus, result, observedAt: clock() };
      await durable.put(`factory/e2e/${receiptId}`, record, { expectedVersion: 0 });
      await durable.append('factory/e2e-events', { receiptId, workId: record.workId, pixieStatus: result.status, observedAt: record.observedAt });
      return { accepted: true, receiptId, pixieStatus: result.status, acceptedAt: record.observedAt };
    },
    async readback({ receipt }) {
      const record = await durable.get(`factory/e2e/${receipt.receiptId}`);
      if (!record) return { verified: false, reason: 'FACTORY_E2E_RECEIPT_NOT_FOUND' };
      const value = record.value;
      return { verified: value.pixieStatus === 'RETURNED' && value.lifecycleStatus === 'COMPLETE', evidenceRef: `evidence://factory/e2e/${value.receiptId}`, pixieStatus: value.pixieStatus, lifecycleStatus: value.lifecycleStatus, observedAt: clock() };
    },
  });
}

export { createPixieOperator };
