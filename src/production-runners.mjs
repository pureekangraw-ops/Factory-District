const DOMAINS = Object.freeze(['CODE', 'VISUAL', 'LOGIC']);

function endpointFor(env, domain) {
  const value = env?.[`${domain}_RUNNER_URL`];
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/$/, '') : null;
}

function createHttpRunner(url, fetchImpl) {
  return async ({ work, actorRef = 'PIXIE' } = {}) => {
    const response = await fetchImpl(`${url}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ work, actorRef }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { status: 'UNKNOWN', reason: `RUNNER_HTTP_${response.status}`, runnerResponse: body };
    return body;
  };
}

export function createProductionRunners(env = {}, { fetchImpl = fetch } = {}) {
  const runners = {};
  const readiness = {};
  for (const domain of DOMAINS) {
    const endpoint = endpointFor(env, domain);
    if (!endpoint) {
      readiness[domain] = { status: 'UNKNOWN', reason: 'MACHINE_NOT_REGISTERED' };
      continue;
    }
    runners[domain] = createHttpRunner(endpoint, fetchImpl);
    readiness[domain] = { status: 'UNKNOWN', reason: 'RUNNER_HEALTH_NOT_PROBED', endpointConfigured: true };
  }
  return Object.freeze({ runners: Object.freeze(runners), readiness: Object.freeze(readiness) });
}
