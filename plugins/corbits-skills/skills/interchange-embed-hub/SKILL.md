---
name: interchange-embed-hub
description: Run an Interchange hub inside your own app process (desktop app, single binary, server) with its database, keys, auth origin, and sidecar provisioner. Load when an app must host its own hub.
user-invocable: false
---

# Hosting an Interchange hub

An embedded hub is a local control plane. Client code is the same as for a remote hub, only the base URL differs, so build the app against `Transport` (`use_skill interchange-hub-setup`). Pick the lowest row that fits:

| Situation                                          | Do this                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| A hub already runs somewhere                       | Embed nothing. Set the hub URL. Run no migrations and place no sidecars locally. |
| Local, Postgres, env-driven                        | `createHubServer({ sidecarProvisioners, probeSidecarProvisioners })`             |
| Local, your own database (pglite) or keychain keys | Copy the hub composition and inject your pieces                                  |

A local app should switch on one setting. Unset means embedded, set means remote. Never migrate against a remote hub.

## Stock hub

`createHubServer` is in `@intx/hub-app/server`, which is private and exported only under the `intx-src` condition. Use it from the upstream workspace or a vendored copy. It reads `DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME`, `HUB_DATA_DIR`, `CREDENTIAL_ENCRYPTION_KEY`, `PRINCIPAL_KEY_ENCRYPTION_KEY`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_SECRET`, and `PORT`. It registers no sidecar provisioner, so you must pass one or deploys fail. Upstream's reference is `tests/admin-ui-e2e/harness/`:

```ts
const lp = createLocalProcessSidecarProvisioner({
  dataRoot: `${HUB_DATA_DIR}/local-sidecars`,
});
export default await createHubServer({
  sidecarProvisioners: [lp.provisioner],
  probeSidecarProvisioners: [lp.provisioner],
});
process.once("SIGTERM", () => void lp.shutdown().then(() => process.exit(0)));
```

Migrate first with `drizzle-kit migrate` in `packages/db`. `runMigrations(cfg, { schema })` has no ledger and is not idempotent, so guard it (check the `user` table exists) and serialize boots with an advisory lock.

## Own composition

Copy `apps/hub/src/server.ts`, as workbench (Postgres) and Solution Builder `packages/embed-hub` (pglite) do. Order: `createDB`, `createAuth`, credential cipher and principal key store, agent repo store, asset service, sidecar credential resolver and router, session service, provisioner registries, allocation service and reconciler, four schedulers, `createApp`, then `Bun.serve({ fetch, websocket })`. The sidecar socket is `/api/sidecars/ws`. Mount extra Hono routes (`@corbits/*`) behind `createRequireGrant`.

Skip a piece and it fails quietly: no schedulers means allocations never progress, no allocation service means `workflow_provisioning_unavailable`, no cipher means plaintext secrets with only a warning.

Expect to re-port when upstream changes. If you need pglite, you also carry the `createDB({ handle, close })` patch, a schema-bound drizzle handle, a shim to postgres.js row shape, and your own migration ledger. pglite is single-writer, so claim the data dir with a pid file.

## Rules that bite

- Mint the credential key, principal key, and signing key once and persist them (OS keychain or an owner-only file). Persist the signing key so old signed commits verify. Never mint a key because the store failed to answer.
- `BETTER_AUTH_BASE_URL` must equal the origin clients use. The default is `http://localhost:3000`, so any other origin fails sign-up as CSRF.
- Loopback is not authentication. Put a host session in front of `/api/*`, and let only the sidecar socket bypass it.
- A sidecar is a child process started by your `SidecarProvisioner.ensure`. Pass only `HUB_WS_URL SIDECAR_ID SIDECAR_TOKEN SIDECAR_DATA_DIR SIDECAR_CREDENTIAL_ENCRYPTION_KEY`, plus optional `SIDECAR_ADAPTER_MANIFEST` (trusted JSON, it runs code). Write a pid file, fence by generation, and reap children on shutdown. Keep the hub port stable, because the socket URL is part of the allocation fingerprint.
- Published `@intx/*` packages resolve to `dist`. The `intx-src` condition needs source they do not ship. Resolve exactly one copy of each package. Solution Builder vendors the whole upstream workspace (pinned revision, `PATCHES.md` with a reason per local edit) for pglite, a newer workflow package, and an offline binary.

## Need more

- App-side setup and deploys: `use_skill interchange-hub-setup`.
- Sidecars, placement, credentials: `use_skill interchange-run-modes`.
- Libraries to mount: `use_skill corbits-hub-libs`.
