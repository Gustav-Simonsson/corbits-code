---
name: interchange-run-modes
description: Pick where the Interchange control plane lives (none with runLocal, embedded hub, remote hub) and how sidecars, credentials, and placement work.
user-invocable: false
---

# Interchange run modes

The question is where the control plane lives. Your workflow and agent code is the same in every mode.

| Tier                          | Control plane                   | Use it when                                                                   |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `runLocal` / in-process agent | none                            | Scripts, CLI tools, CI, tests, dev loops, one user, run ends with the process |
| Embedded hub                  | in your app process             | You need hub features but want one local binary (desktop app)                 |
| Remote hub                    | a hosted hub, sidecars dial out | Shared team, runs must outlive any one machine, work placed on other hosts    |

Embedded and remote differ only in a base URL. An app written against the hub `Transport` switches by config (`use_skill interchange-embed-hub`, `use_skill interchange-client-apps`). Moving up from `runLocal` is a deploy, not a rewrite, so start without a hub unless you need one of the reasons below.

## Skip the hub when

- Nothing to stand up: no database, keys, auth origin, or sidecar processes, and a cold start in milliseconds.
- State is inspectable and disposable (a directory), with no second source of truth.
- Tests and CI want hermetic runs with scripted inference and no ambient credentials.
- One person starts the run and watches it end.
- HITL is fine while the process lives: `run.signal(name, payload, signalId)` answers an `awaitSignal`.
- You want to avoid depending on the alpha hub surface.

## Want a control plane when

- Waits must outlive the process (approvals, `awaitSignal`, timers): the hub parks, persists, and resumes after a crash. `runLocal` has no durability and a crashed run is terminal.
- Credentials are shared and rotated: the hub seals provider keys and freezes a failover chain at deploy.
- Triggers run while you are away: mail, cron, webhooks.
- Several principals need grants, an audit trail, approvals routes, and spend accounting.
- Work should run in a sandbox or on another host (sidecar placement).
- Runs need addresses so people and agents can mail them.
- A deploy must be pinned to a commit.

## runLocal

`runLocal(definition, { authorize, hasUpstreamSignalResolver, ... })` returns `{ runId, complete, cancel, signal }`. `authorize` and `hasUpstreamSignalResolver` are required; pass `true` for a top-level run you will signal.

- Supported: signals, authorize, actions (need `actionResolver`), loops (need `loopFns`), inline child workflows, timers, an in-memory event log in `RunResult.events`, cancel, and `resumeFromEvents` if you feed the log back yourself.
- Not supported: persistence, crash resume, drain, hub approval rows or `/approvals` routes, mail and triggers, tools, hub credentials, placement.
- The default step invoker is a stub that returns `{ output: null }`. To run a model, pass an `invokeStep` that builds `createAgent` and calls `agent.send`.
- An untimed `awaitSignal` inside a `childWorkflow` fails the child, because nothing can answer it.
- Unverified: whether `onTrigger` sections run locally.

For a single agent without a workflow, use in-process `createAgent` with a git-backed store and `@intx/tools-posix` (`use_skill interchange-agents`). You supply `authorize` and audit.

Desktop means a local process: in-process, or an embedded hub that spawns a local sidecar process. There is no dedicated desktop harness. Container, VM, Workers, and browser hosts are in progress, not shipped.

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
- Client app driving a hub: `use_skill interchange-client-apps`. Host embedding a hub: `use_skill interchange-embed-hub`.
- Workflow authoring: `use_skill interchange-workflows`.
- Overview: `use_skill interchange`.
