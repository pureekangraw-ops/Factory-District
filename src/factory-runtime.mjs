import {
  createHandoff,
  createReceipt,
  FACTORY_STATUS,
  FACTORY_STATION_ID,
  FACTORY_VERIFICATION_SCOPE,
} from './contract.mjs';
import { createPixie } from './pixie.mjs';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function statusCode(status) {
  return status === FACTORY_STATUS.DENIED ? 'DENIED' : status === FACTORY_STATUS.UNKNOWN ? 'UNKNOWN' : status;
}

export function createFactoryRuntime({
  clock = () => new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
  sourceSha = 'UNKNOWN',
  domainHandlers = {},
} = {}) {
  const receipts = new Map();
  const pixie = createPixie({ clock, idFactory, handlers: domainHandlers });

  function health() {
    const observedAt = clock();
    return {
      service: 'factory-district',
      stationId: FACTORY_STATION_ID,
      status: sourceSha === 'UNKNOWN' ? FACTORY_STATUS.UNKNOWN : FACTORY_STATUS.READY,
      sourceSha,
      runtimeSha: sourceSha,
      observedAt,
    };
  }

  async function receive(input = {}) {
    const handoff = createHandoff({ ...input, requestedAt: input.requestedAt || clock() });
    const receiptId = `receipt-${idFactory()}`;
    const acceptedAt = clock();
    let status = FACTORY_STATUS.ACCEPTED;
    let outcome = null;
    let evidenceRef = null;
    let verificationScope = null;
    let domainCompleted = false;
    let reason = null;
    let pixieResult = null;

    if (handoff.expectedSourceSha && handoff.expectedSourceSha !== sourceSha) {
      status = FACTORY_STATUS.UNKNOWN;
      reason = 'SHA_MISMATCH';
    } else {
      pixieResult = await pixie.execute(handoff, { sourceSha });
      status = statusCode(pixieResult.status);
      reason = pixieResult.reason || null;
      outcome = pixieResult.status === FACTORY_STATUS.HANDOFF_VERIFIED ? FACTORY_STATUS.HANDOFF_VERIFIED : null;
      evidenceRef = pixieResult.evidence?.evidenceRef || null;
      verificationScope = pixieResult.verificationScope || null;
      domainCompleted = pixieResult.domainCompleted === true;
    }

    const receipt = createReceipt({ receiptId, handoff, status, acceptedAt, outcome, evidenceRef, verificationScope, domainCompleted, reason });
    const readback = {
      receiptId,
      workId: handoff.workId,
      checkpointId: handoff.checkpointId,
      stationId: FACTORY_STATION_ID,
      status,
      boundaryVerified: status === FACTORY_STATUS.HANDOFF_VERIFIED && verificationScope === FACTORY_VERIFICATION_SCOPE.BOUNDARY_HANDOFF && Boolean(evidenceRef),
      verificationScope,
      domainCompleted,
      evidenceRef,
      sourceSha,
      observedAt: clock(),
      reason,
    };
    receipts.set(receiptId, Object.freeze({ receipt, readback, pixieResult, handoff }));
    return Object.freeze({ receipt, readback, pixie: pixieResult });
  }

  function readback(receiptId) {
    const id = requiredString(receiptId, 'receiptId');
    const record = receipts.get(id);
    if (!record) return { status: FACTORY_STATUS.UNKNOWN, boundaryVerified: false, verificationScope: null, domainCompleted: false, receiptId: id, reason: 'RECEIPT_NOT_FOUND' };
    return record.readback;
  }

  return Object.freeze({ health, receive, readback });
}
