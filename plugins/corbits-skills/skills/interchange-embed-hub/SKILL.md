---
name: interchange-embed-hub
description: Compose, embed, and run an Interchange hub inside your own app host (database, keys, auth origin, sidecar provisioner, reconcilers, vendoring).
user-invocable: false
---

# Embedding an Interchange hub

Use this when your app owns the hub process: a desktop host, a single binary, or a server that mounts Interchange next to its own routes. For what the app then does over HTTP, see `use_skill interchange-client-apps`.

## Stock vs composed

- Upstream `createHubServer` (`apps/hub/src/server.ts`) takes only provisioner and placement options (`sidecarProvisioners`, `probeSidecarProvisioners`, choosers, capability rules). The database, keys, and data dir come from env: `DB_*`, `HUB_DATA_DIR`, `CREDENTIAL_ENCRYPTION_KEY`, `PRINCIPAL_KEY_ENCRYPTION_KEY`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`.
- An app that needs its own database, auth, or key store copies that composition. Workbench (`apps/hub/src/server.ts`, about 860 lines, real Postgres) and Solution Builder (`packages/embed-hub`, pglite) both do. Expect to re-port when upstream changes.
- The reusable surface is `createApp` and `mountHubRoutes` from `@intx/hub-api` (pass your own `getSession`, which is not tied to better-auth), plus the factories in `@intx/hub-sessions` and `@intx/db`. Mount extra Hono routes (`@corbits/*` libraries) with `createRequireGrant`.

## The composition, in order

`createDB` then `createAuth(db)`, credential cipher and principal key store (two distinct 32-byte hex keys), agent repo store (signs with the hub key), asset service, sidecar credential resolver and router, event collectors, session service, sidecar plugin registries (deployment and probe provisioners), workflow allocation and dispatch services, the allocation reconciler, four reconciliation schedulers, then `createApp`. Serve with `Bun.serve({ fetch, websocket })` (the sidecar WebSocket lives at `/api/sidecars/ws`).

Start the schedulers or allocations never progress. Omit the allocation service and deploys fail with `workflow_provisioning_unavailable`. Omit the cipher and secrets are stored unencrypted with only a warning.

## Embedded vs remote

Solution Builder switches on one env var (`<PREFIX>_HUB_URL`). Unset, the hub is a Hono app inside the host process and calls go to `hub.app.fetch` with no socket. Set, the host mounts nothing, runs no migrations, and places no sidecars, because a local migration would create a second, divergent control plane.

## Database and migrations

- Upstream targets Postgres. `runMigrations(cfg, { schema })` has no ledger and is not idempotent, so guard it (check a table exists) and serialize boots with an advisory lock. The standard flow is `drizzle-kit migrate`. Run each Corbits library's migrations after it.
- pglite is not supported upstream. Solution Builder runs it with one vendor patch (`createDB({ handle, close })`), a schema-bound `drizzle(pglite, { schema })`, a shim that returns rows in postgres.js shape, and its own migration ledger. pglite is single-writer: claim the data dir with a pid file, and never auto-migrate a database stamped by an older revision.

## Keys and auth origin

- Mint the credential key, principal key, and hub signing key once and persist them (OS keychain or an owner-only file). Never mint when the store merely failed to answer. Persist the signing key so earlier signed commits still verify.
- Set `BETTER_AUTH_BASE_URL` to the exact origin clients use. The default is `http://localhost:3000`, which makes better-auth reject a loopback sign-up as CSRF.
- Loopback is not authentication. Solution Builder adds a host session token (keychain, exchanged for an HttpOnly cookie) in front of `/api/*`, and lets the sidecar WebSocket bypass it because the hub checks the sidecar's own token.

## Sidecars

Sidecars exist only through a `SidecarProvisioner`. Spawn the sidecar entry as a child process with an allowlisted env: `HUB_WS_URL`, `SIDECAR_ID`, `SIDECAR_TOKEN`, `SIDECAR_DATA_DIR`, `SIDECAR_CREDENTIAL_ENCRYPTION_KEY`, optional `SIDECAR_ADAPTER_MANIFEST` (JSON array of `{ provider, specifier, export }`, trusted input that runs code). Write a pid file before anything else, fence by generation, and reap children on shutdown, because sidecars outlive a killed host and dial a hub that is gone. The WebSocket URL is part of the binding fingerprint, so keep the port stable.

## Consuming Interchange

Prefer published `@intx/*` packages. Solution Builder vendors the whole upstream workspace (pinned revision, a `PATCHES.md` with a reason and kill date per local edit) because it needs pglite injection, a newer `@intx/workflow`, and an offline compiled binary. Published tarballs carry an `intx-src` export condition that points at source they do not ship, so sidecars and deployed workflows need built `dist/`. Resolve exactly one copy of each `@intx/*` package.

## Need more

- What the app does after the hub is up: `use_skill interchange-client-apps`.
- Sidecar protocol, placement, credentials: `use_skill interchange-run-modes`.
- Libraries to mount: `use_skill corbits-hub-libs`.
- Overview: `use_skill interchange`.
