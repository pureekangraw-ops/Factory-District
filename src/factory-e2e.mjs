import { assertDurableStore } from './durable-store.mjs';
import { createDwarfOperator } from './dwarf-autonomous.mjs';

function requiredString(value, name) { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`); return value.trim(); }

export function createFactoryStationReceiver({ dwarf, store, clock = () => new Date().toISOString() } = {}) {
  if (!dwarf || typeof dwarf.run !== 'function') throw new TypeError('dwarf_REQUIRED');
  const durable = assertDurableStore(store);
  return Object.freeze({
    async dispatch({ envelope }) {
      const result = await dwarf.run({ work: envelope.work, domain: envelope.domain, machineId: envelope.machineId, authorityRef: envelope.authorityRef });
      const receiptId = `factory-receipt-${requiredString(envelope.work?.workId, 'envelope.work.workId')}-${clock()}`;
      const record = { receiptId, workId: envelope.work?.workId || null, dwarfStatus: result.status, lifecycleStatus: result.lifecycleStatus, result, observedAt: clock() };
      await durable.put(`factory/e2e/${receiptId}`, record, { expectedVersion: 0 });
      await durable.append('factory/e2e-events', { receiptId, workId: record.workId, dwarfStatus: result.status, observedAt: record.observedAt });
      return { accepted: true, receiptId, dwarfStatus: result.status, acceptedAt: record.observedAt };
    },
    async readback({ receipt }) {
      const record = await durable.get(`factory/e2e/${receipt.receiptId}`);
      if (!record) return { verified: false, reason: 'FACTORY_E2E_RECEIPT_NOT_FOUND' };
      const value = record.value;
      return { verified: value.dwarfStatus === 'RETURNED' && value.lifecycleStatus === 'COMPLETE', evidenceRef: `evidence://factory/e2e/${value.receiptId}`, dwarfStatus: value.dwarfStatus, lifecycleStatus: value.lifecycleStatus, observedAt: clock() };
    },
  });
}

export { createDwarfOperator };
