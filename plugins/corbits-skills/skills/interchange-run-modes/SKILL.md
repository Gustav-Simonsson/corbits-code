---
name: interchange-run-modes
description: Pick where an Interchange agent runs (in-process, local hub, remote hub plus sidecar) and how sidecars, credentials, and placement work.
user-invocable: false
---

# Interchange run modes

Pick the smallest mode that meets the need.

| Situation                                             | Mode                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| One agent inside your own CLI or app, one user        | In-process `createAgent` with an isogit `contextDir`           |
| Coding agent over a local tree                        | In-process plus `@intx/tools-posix` (and LSP), set `toolCwd`   |
| Test a workflow                                       | `runLocal` with scripted inference                             |
| Durable steps, crash resume, approvals, audit         | Hub plus sidecar                                               |
| Multiple users or tenants, grants, pushed credentials | Hub required                                                   |
| Host behind NAT, on a laptop, or firewalled           | Sidecar dials out to the hub                                   |
| "Desktop" personal agent                              | In-process, or a local hub that spawns a local sidecar process |
| Untrusted workload                                    | Provisioner that declares an `isolation:*` capability          |

There is no dedicated desktop harness in the repo. Desktop means the local-process mode. Container, VM, Workers, and browser hosts are in progress, not shipped.

## In-process (no hub)

See `use_skill interchange-agents`. There is no tenancy, remote credential push, or multi-user auth. You supply `authorize` and audit yourself.

## Hub plus sidecar

- The hub is the control plane (Postgres, tenants, grants, credentials, deploys, git). A sidecar is a host process that connects outbound over one WebSocket (`HUB_WS_URL`), registers with an allocation token, then runs each deployment as a supervised child (`bin/workflow-child`). It needs no public address. Use `wss://` off loopback.
- Sidecar env: `SIDECAR_DATA_DIR`, `HUB_WS_URL`, `SIDECAR_ID`, `SIDECAR_TOKEN`, `SIDECAR_CREDENTIAL_ENCRYPTION_KEY`.
- Sidecars exist only through a `SidecarProvisioner` (`ensure` and `destroy`, idempotent, generation-fenced). Inject them with `createHubServer({ sidecarProvisioners, probeSidecarProvisioners })`. None is registered by default, so a fresh dev hub cannot probe or deploy.
- A local-process provisioner just spawns `apps/sidecar/src/index.ts` with those env vars. The reference is `tests/admin-ui-e2e/harness/local-process-sidecar-provisioner.ts` upstream.
- A crashed child is respawned with backoff (1 s doubling to 30 s). Three exits in 60 s latch `crash-looping` and fail the run.
- Dev stack: `bin/db-reset && bin/dev --seed` gives the hub on :3000 and the admin UI on :5173.

## Credentials

Agents never discover credentials. The hub resolves them at launch and the harness mediates use. Inference keys travel inside the `agent.deploy` frame, and rotation pushes `sources.update`. Tool credentials are tenant-owned, decrypted on the hub, and delivered over the control channel. Proactive OAuth refresh is not built. Docs disagree on whether keys sit in `deployment.json`, so check `DEV.md` and the code before relying on either.

## Placement

A workflow declares what it needs, and a provisioner advertises what it offers:

```ts
sidecarPlacement: {
  capabilities: [{ capability: "platform:ios", effect: "require" }];
}
```

Selectors are exact, `ns:*`, or `*`. Effects are `require` or `block`, and block wins ties. Tenant policy can add constraints that workflows cannot weaken. The OS or container sandbox boundary is not built, so grants are not a syscall or network sandbox.

## Need more

- Upstream docs: `HARNESS_DESIGN.md`, `SIDECAR_PLACEMENT.md`, `CREDENTIALS.md`, `AUTH.md`, `GIT_ACCESS.md`, `unified-execution-host-design.md`.
- Client app driving a hub: `use_skill interchange-client-apps`.
- Workflow authoring: `use_skill interchange-workflows`.
- Overview: `use_skill interchange`.
