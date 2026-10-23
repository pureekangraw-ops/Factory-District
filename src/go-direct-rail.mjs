// A GO Brain-originated Factory handoff uses an independently authenticated
// private Cloudflare Worker rail, not PANTHEON or a caller-supplied URL.
// This validator deliberately does not mint Work IDs or Work Passes.
const fail = () => { const error = new Error('GO_FACTORY_SCOPE_DENIED'); error.code = 'GO_FACTORY_SCOPE_DENIED'; throw error; };
const isText = v => typeof v === 'string' && v.length > 0 && v.length <= 200;
const hasExactly = (actual, expected) =>
  Array.isArray(actual) && actual.length === expected.length &&
  actual.every(x => expected.includes(x));
const inputRef = value => typeof value === 'string' &&
  /^r2:\/\/factory\/edge-inputs\/[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.json#sha256=[a-f0-9]{64}$/.test(value);
export function validateGoDirectHandoff(v) {
  const w = v?.workPass, actor = 'GO';
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
  if (!isText(v.workId) || !isText(v.checkpointId) || !isText(v.workPassRef) ||
      !/^[a-f0-9]{40}$/.test(v.expectedSourceSha || '') || 
      !isText(v.requestedAt) || !Number.isFinite(Date.parse(v.requestedAt))) fail();
  if (v.source?.system !== 'go-together' || v.source?.stationId !== 'GO-BRAIN' ||
      v.target?.system !== 'factory-district' || v.target?.stationId !== 'FACTORY-STATION' ||
      v.target?.component !== 'FACTORY_HALL') fail();
  if (w?.kind !== 'WORK_PASS' || w.version !== 'WORK_PASS_V1' ||
      w.status !== 'ACTIVE' || w.actor !== actor || w.authorityTransferred === true ||
      w.workId !== v.workId || w.checkpointId !== v.checkpointId ||
      !isText(w.passId) || v.workPassRef !== 'work-pass://' + w.passId ||
      !Array.isArray(w.permissions?.actions) || !w.permissions.actions.includes('handoff') ||
      !Array.isArray(w.permissions?.handoff) ||
      !w.permissions.handoff.some(x => x?.stationId === 'FACTORY_STATION')) fail();
  // No second actor, delegation or caller-chosen operation on this GO rail.
  if (v.actingActor != null || v.cityAuthorization != null || v.operation != null ||
      v.credential != null || v.secret != null || v.token != null) fail();
  const domain = v.ownerDomain;
  if (domain === 'CODE') {
    if (v.intent !== 'EXECUTE_CODE' || !hasExactly(v.scope,['EXECUTE:CODE','DEPLOY:CODE']) ||
        !Array.isArray(v.inputRefs) || v.inputRefs.length !== 1 || !inputRef(v.inputRefs[0])) fail();
  } else if (domain === 'VISUAL') {
    if (v.intent !== 'EXECUTE_VISUAL' || !hasExactly(v.scope,['EXECUTE:VISUAL']) ||
        !Array.isArray(v.inputRefs) || v.inputRefs.length !== 1 || !inputRef(v.inputRefs[0])) fail();
  } else if (domain === 'LOGIC') {
    if (v.intent !== 'PLACE_DWARF_LOGIC_TRAINEE' || !hasExactly(v.scope,['EXECUTE:LOGIC']) ||
        !Array.isArray(v.inputRefs) || v.inputRefs.length !== 0) fail();
  } else fail();
  return v;
}
