import {
  createHandoff,
  createReceipt,
  FACTORY_STATUS,
  FACTORY_STATION_ID,
  FACTORY_VERIFICATION_SCOPE,
} from './contract.mjs';
import { createPixie } from './pixie.mjs';
import { assertDurableStore } from './durable-store.mjs';
import { verifyDwarfLogicPlacement } from './dwarf-logic-trainee.mjs';

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

// A durable claim is created before touching a machine. If a rail retry arrives
// after a timeout, it must read the prior outcome rather than execute twice.
async function shaHex(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function scopedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function claimIdentity(handoff) {
  // Credentials and timestamps are deliberately not part of the claim identity.
  const claimKey = `factory/claim/${await shaHex([handoff.workId, handoff.checkpointId])}`;
  const fingerprint = await shaHex({
    workId: handoff.workId, checkpointId: handoff.checkpointId,
    workPassRef: handoff.workPassRef, actingActor: handoff.actingActor,
    passActor: handoff.passActor, authorizationSource: handoff.authorizationSource,
    source: handoff.source, target: handoff.target, ownerDomain: handoff.ownerDomain,
    intent: handoff.intent, scope: handoff.scope, inputRefs: handoff.inputRefs,
    expectedSourceSha: handoff.expectedSourceSha,
  });
  return { claimKey, fingerprint };
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

  // Read-only validation through the same contract used by receive().
  // No Work is created, no receipt is issued, and no domain runner is invoked.
  async function preflight(input = {}) {
    const handoff = createHandoff({ ...input, requestedAt: input.requestedAt || clock() });
    if (handoff.expectedSourceSha && handoff.expectedSourceSha !== sourceSha) {
      const error = new Error('SHA_MISMATCH');
      error.code = 'SHA_MISMATCH';
      throw error;
    }
    return Object.freeze({
      status: 'READY',
      allowed: true,
      workId: handoff.workId,
      checkpointId: handoff.checkpointId,
      workPassRef: handoff.workPassRef,
      actingActor: handoff.actingActor,
      authorizationSource: handoff.authorizationSource,
      sourceSha,
      operation: String(input.operation || ''),
      validationScope: 'FACTORY_BOUNDARY_PREFLIGHT',
      observedAt: clock(),
    });
  }

  async function receive(input = {}) {
    const handoff = createHandoff({ ...input, requestedAt: input.requestedAt || clock() });
    const receiptId = `receipt-${idFactory()}`;
    const { claimKey, fingerprint } = await claimIdentity(handoff);
    try {
      await store.put(claimKey, { receiptId, fingerprint, status: 'IN_PROGRESS', claimedAt: clock() }, { expectedVersion: 0 });
    } catch (error) {
      if (error?.message !== 'DURABLE_CONFLICT') throw error;
      const claimed = (await store.get(claimKey))?.value;
      if (!claimed) throw scopedError('FACTORY_CLAIM_UNCERTAIN');
      if (claimed.fingerprint !== fingerprint) throw scopedError('FACTORY_WORK_SCOPE_CONFLICT');
      // A receipt is the authority. A pending claim is NOT a failure to
      // execute: the machine may have already performed its effect.
      const stored = (await store.get(receiptKey(claimed.receiptId)))?.value;
      if (stored) return Object.freeze({ receipt: stored.receipt, readback: stored.readback, pixie: stored.pixieResult });
      return Object.freeze({
        receipt: { receiptId: claimed.receiptId, workId: handoff.workId, checkpointId: handoff.checkpointId,
          workPassRef: handoff.workPassRef, status: FACTORY_STATUS.UNKNOWN,
          reason: 'FACTORY_EFFECT_UNRECONCILED' },
        readback: { receiptId: claimed.receiptId, workId: handoff.workId, checkpointId: handoff.checkpointId,
          workPassRef: handoff.workPassRef, status: FACTORY_STATUS.UNKNOWN,
          boundaryVerified: false, domainCompleted: false, domainVerified: false,
          reason: 'FACTORY_EFFECT_UNRECONCILED' },
        pixie: null,
      });
    }
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
      originSystem: handoff.source.system,
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

  // Reconstruct only from independently persisted LOGIC trainee evidence.
  // Never invoke PIXIE or a domain handler from this reconciliation path.
  async function reconcile(input = {}) {
    const handoff = createHandoff({ ...input, requestedAt: input.requestedAt || clock() });
    const { claimKey, fingerprint } = await claimIdentity(handoff);
    const claim = (await store.get(claimKey))?.value;
    if (!claim) return { status: 'UNKNOWN', reason: 'FACTORY_CLAIM_NOT_FOUND', recovered: false };
    if (claim.fingerprint !== fingerprint) throw scopedError('FACTORY_WORK_SCOPE_CONFLICT');
    const existing = (await store.get(receiptKey(claim.receiptId)))?.value;
    if (existing) return { status: 'RECORDED', receipt: existing.receipt, readback: existing.readback, recovered: false };
    if (handoff.ownerDomain !== 'LOGIC' || handoff.intent !== 'PLACE_DWARF_LOGIC_TRAINEE')
      return { status: 'UNKNOWN', reason: 'RECONCILIATION_REQUIRES_MANUAL_REVIEW', recovered: false, receiptId: claim.receiptId };
    // A prior placement cannot override gates that prevented this intake from
    // executing. Keep the same eligibility checks as receive()/PIXIE.
    if (handoff.expectedSourceSha && handoff.expectedSourceSha !== sourceSha)
      return { status: 'UNKNOWN', reason: 'SHA_MISMATCH', recovered: false, receiptId: claim.receiptId };
    if (!handoff.scope.includes('EXECUTE:LOGIC'))
      return { status: 'UNKNOWN', reason: 'SCOPE_NOT_GRANTED', recovered: false, receiptId: claim.receiptId };
    const key = `logic/trainees/DWARF-01/${handoff.workId}/${handoff.checkpointId}`;
    const source = await store.get(key);
    const proof = source?.value;
    const verified = verifyDwarfLogicPlacement(source, { work: handoff });
    if (!verified) return { status: 'UNKNOWN', reason: 'DURABLE_LOGIC_EFFECT_UNVERIFIED',
      recovered: false, receiptId: claim.receiptId };
    const evidenceRef = `r2://factory/records/${key}`,time=clock();
    const receipt = createReceipt({
      receiptId: claim.receiptId, handoff, status: FACTORY_STATUS.HANDOFF_VERIFIED,
      acceptedAt: claim.claimedAt || time, evidenceRef,
      verificationScope: FACTORY_VERIFICATION_SCOPE.BOUNDARY_HANDOFF, domainCompleted: true,
    });
    const readback = {
      receiptId: claim.receiptId, workId: handoff.workId,
      checkpointId: handoff.checkpointId, workPassRef: handoff.workPassRef,
      actingActor: handoff.actingActor, authorizationSource: handoff.authorizationSource,
      stationId: FACTORY_STATION_ID,status: FACTORY_STATUS.HANDOFF_VERIFIED,
      boundaryVerified: true, verificationScope: FACTORY_VERIFICATION_SCOPE.BOUNDARY_HANDOFF,
      domainCompleted: true, domainVerified: true,
      result: { workId:handoff.workId,checkpointId:handoff.checkpointId,
        workPassRef:handoff.workPassRef,actingActor:handoff.actingActor,
        authorizationSource:handoff.authorizationSource,ownerDomain:handoff.ownerDomain,
        resultRefs:[],artifactRefs:[],evidenceRefs:[evidenceRef] },
      evidenceRef,sourceSha,observedAt:time,reason:'RECOVERED_FROM_DURABLE_LOGIC_PLACEMENT',
      recovered: true,recoveryBasis:'PERSISTED_DWARF_LOGIC_TRAINEE',
      machineResult: { trainee: proof, storageVersion: source.version,
        run: {workId:handoff.workId,checkpointId:handoff.checkpointId,
          verificationRef:evidenceRef,returnRef:evidenceRef+'#return',
          evidenceRefs:[evidenceRef],executionState:'COMPLETE',returnState:'RETURNED'}},
    };
    const record = { kind:'FACTORY_RECEIPT_RECORD',receipt,readback,
      pixieResult:null,handoff,recovery:{basis:'PERSISTED_DWARF_LOGIC_TRAINEE',at:time} };
    try {
      await store.put(receiptKey(claim.receiptId),record,{expectedVersion:0});
    } catch(error) {
      if(error?.message !== 'DURABLE_CONFLICT')throw error;
      const winner=(await store.get(receiptKey(claim.receiptId)))?.value;
      if(!winner)throw scopedError('FACTORY_RECEIPT_RECOVERY_UNCERTAIN');
      return {status:'RECORDED',receipt:winner.receipt,readback:winner.readback,recovered:false};
    }
    await store.append('factory/receipt-events',{kind:'FACTORY_RECEIPT_RECOVERED',
      receiptId:claim.receiptId,workId:handoff.workId,evidenceRef,observedAt:time});
    return {status:'RECOVERED',receipt,readback,recovered:true};
  }

  async function readback(receiptId) {
    const id = requiredString(receiptId, 'receiptId');
    const record = await store.get(receiptKey(id));
    if (!record) return { status: FACTORY_STATUS.UNKNOWN, boundaryVerified: false, verificationScope: null, domainCompleted: false, domainVerified: false, result: null, receiptId: id, reason: 'RECEIPT_NOT_FOUND' };
    return record.value.readback;
  }

  // Internal read-only receipt recovery by Factory job identity; GO caller is
  // authenticated at the Worker endpoint before this lookup is exposed.
  async function lookupClaim(workId,checkpointId) {
    const key='factory/claim/'+await shaHex([workId,checkpointId]);
    const claim=(await store.get(key))?.value;
    if(!claim?.receiptId)return {receiptId:null,readback:null};
    return {receiptId:claim.receiptId,readback:await readback(claim.receiptId)};
  }
  return Object.freeze({ health, preflight, receive, reconcile, readback, lookupClaim });
}
