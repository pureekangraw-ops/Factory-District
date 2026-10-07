# Dwarf Crew app — first slice

A mobile-width web interface for Factory and Metropolis maintenance intent drafts,
with existing Work/checkpoint readback through Metropolis MCP. This is a separate
local app; the current Factory Worker and PIXIE operator are unchanged.

## Run

Node 22 or later: `npm run crew:serve`, then open `http://127.0.0.1:8788`.
Without configuration the UI runs and correctly reports `METRO_NOT_CONFIGURED`.
Set `METROPOLIS_MCP_URL` to the owner-confirmed HTTPS MCP endpoint and
`METROPOLIS_ACCESS_TOKEN` to an owner-issued OAuth access token in the **server
environment**. Never paste credentials into source, browser storage or URLs.
An expired token reports UNKNOWN/auth required; automatic OAuth login and token
refresh are not implemented. ChatGPT plugin credentials cannot be extracted or
reused automatically by this application.

The server is intentionally local-only and not suitable for public hosting.
Mobile layout is implemented; accessing it on a physical phone requires an
owner-approved authenticated hosting route, which this PR does not create.
No Worker, Cloudflare binding, R2 bucket, identity or authority is provisioned.

## Behavior and limits

- Refresh arrival before each Work read; show only owner-listed Works.
- Require the current read grant and checkpoint; reject mismatched readback.
- Keep factory/maintenance intent drafts in page memory, copy them on request.
- No intake/handoff/return writes, no repair or machine execution, and no
  completion claims. Empty works/grants stay empty.
- Remote hosts, cross-origin requests and write methods are blocked by the local
  app service. Errors never expose remote response bodies or credentials.
- Return status and evidence are displayed as owner readback, not independently
  certified execution. Draft Work selection never creates a new Work.

This slice does **not** replace PIXIE or a proxy; the intended replacement is
still unresolved. Dwarf agent identities, callable repair handlers, dispatch,
safe rollback, hosted mobile access and live app-to-MCP E2E remain pending.

## Evidence

The real Metro entrance plugin was read on 2026-10-07: authenticated GO,
source `8c1827face47404903c5e78970a5c6c4e8d38dff`, no current Work and no authorized
actions. That proves plugin arrival only; it does not prove this separate app's
OAuth connection. Bridge/service tests use injected responses, never fake live
identities. Existing Factory tests plus eight new bridge/service tests passed
66/66. No live command was executed.
