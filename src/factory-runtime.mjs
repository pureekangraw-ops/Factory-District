import {
  createHandoff,
  createReceipt,
  FACTORY_STATUS,
  FACTORY_STATION_ID,
  FACTORY_VERIFICATION_SCOPE,
} from './contract.mjs';
import { createPixie } from './pixie.mjs';
import { assertDurableStore } from './durable-store.mjs';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function statusCode(status) {
  return status === FACTORY_STATUS.DENIED ? 'DENIED' : status === FACTORY_STATUS.UNKNOWN ? 'UNKNOWN' : status;
}

function receiptKey(receiptId) {
  return `factory/receipt/${requiredString(receiptId, 'receiptId')}`;
}

export function createFactoryRuntime({
  clock = () => new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
  sourceSha = 'UNKNOWN',
  domainHandlers = {},
  recordStore,
} = {}) {
  const store = assertDurableStore(recordStore);
  const pixie = createPixie({ clock, idFactory, handlers: domainHandlers });

  function health() {
    const observedAt = clock();
    return {
      service: 'factory-district',
      stationId: FACTORY_STATION_ID,
      status: sourceSha === 'UNKNOWN' ? FACTORY_STATUS.UNKNOWN : FACTORY_STATUS.READY,
      sourceSha,
      runtimeSha: sourceSha,
      storage: { status: 'READY', durability: 'ADAPTER' },
      transport: { status: 'READY', kind: 'HTTP', receivePath: '/station/receive', readbackPath: '/station/readback/:receiptId' },
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
    const boundaryVerified = status === FACTORY_STATUS.HANDOFF_VERIFIED
      && verificationScope === FACTORY_VERIFICATION_SCOPE.BOUNDARY_HANDOFF
      && Boolean(evidenceRef);
    const machineResult = pixieResult?.result?.machineResult || null;
    const resultRefs = Array.isArray(machineResult?.run?.resultRefs) ? machineResult.run.resultRefs.filter(Boolean) : [];
    const machineEvidenceRefs = Array.isArray(machineResult?.run?.evidenceRefs) ? machineResult.run.evidenceRefs.filter(Boolean) : [];
    const domainVerified = domainCompleted === true;
    const result = domainVerified ? {
      workId: handoff.workId,
      checkpointId: handoff.checkpointId,
      workPassRef: handoff.workPassRef,
      actingActor: handoff.actingActor,
      authorizationSource: handoff.authorizationSource,
      ownerDomain: handoff.ownerDomain,
      resultRefs,
      artifactRefs: resultRefs,
      evidenceRefs: machineEvidenceRefs,
    } : null;
    const readback = {
      receiptId,
      workId: handoff.workId,
      checkpointId: handoff.checkpointId,
      workPassRef: handoff.workPassRef,
      actingActor: handoff.actingActor,
      authorizationSource: handoff.authorizationSource,
      stationId: FACTORY_STATION_ID,
      status,
      boundaryVerified,
      verificationScope,
      domainCompleted,
      domainVerified,
      result,
      evidenceRef,
      sourceSha,
      machineResult,
      observedAt: clock(),
      reason,
    };
    await store.put(receiptKey(receiptId), { kind: 'FACTORY_RECEIPT_RECORD', receipt, readback, pixieResult, handoff }, { expectedVersion: 0 });
    await store.append('factory/receipt-events', { receiptId, workId: handoff.workId, workPassRef: handoff.workPassRef, status, evidenceRef, observedAt: readback.observedAt });
    return Object.freeze({ receipt, readback, pixie: pixieResult });
  }

  async function readback(receiptId) {
    const id = requiredString(receiptId, 'receiptId');
    const record = await store.get(receiptKey(id));
    if (!record) return { status: FACTORY_STATUS.UNKNOWN, boundaryVerified: false, verificationScope: null, domainCompleted: false, domainVerified: false, result: null, receiptId: id, reason: 'RECEIPT_NOT_FOUND' };
    return record.value.readback;
  }

  return Object.freeze({ health, receive, readback });
}
