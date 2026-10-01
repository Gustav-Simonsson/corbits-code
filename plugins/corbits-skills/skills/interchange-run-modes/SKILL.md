---
name: interchange-run-modes
description: Choose where an Interchange workflow or agent runs (runLocal, embedded hub, remote hub plus sidecar), and set up sidecars, credentials, and placement. Load when deciding whether you need a hub.
user-invocable: false
---

# Interchange run modes

The question is where the control plane lives. Workflow and agent code is the same in every mode.

| Mode                        | Control plane             | Use when                                                                      |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `runLocal` or `createAgent` | none                      | Scripts, CLI tools, CI, tests, dev loops, one user, run ends with the process |
| Embedded hub                | inside your app           | You need hub features in one local binary, such as a desktop app              |
| Remote hub                  | hosted, sidecars dial out | Shared team, runs outlive any machine, work placed on other hosts             |

Embedded and remote differ only by base URL. Moving up from `runLocal` is a deploy, not a rewrite. Default to no hub, and move up for one of these reasons:

- A wait (`awaitSignal`, approval, timer) must outlive the process. The hub parks, persists, and resumes after a crash.
- Credentials are shared or rotated. The hub seals them and freezes a failover chain at deploy.
- Triggers must fire while you are away (mail, cron, webhooks).
- Several principals need grants, audit, approvals, and spend accounting.
- Work must run in a sandbox or on another host.
- People or agents must mail a run by address.
- A deploy must be pinned to a commit.

Hub setup: `use_skill interchange-embed-hub`, `use_skill interchange-hub-setup`.

## runLocal

Runs the real workflow runtime with in-memory parts. Reference: upstream `examples/workflow-quickstart`.

```ts
const run = runLocal(workflow, {
  authorize: allowAll, // required, no default
  hasUpstreamSignalResolver: true, // required, true for a top-level run you will signal
  actionResolver, // ref -> ActionHandler, throws on unknown
  loopFns, // ref -> LoopFn, throws on unknown
  invokeStep: createAgentStepInvoker({
    source,
    material,
    contextDir,
    authorize: allowAll,
  }),
});
await run.signal("go", payload, "sig-1"); // answers an awaitSignal
const result = await run.complete; // { terminalStatus, outputs, events }
```

- The default `invokeStep` calls `authorize` and returns `{ output: null }`. It runs no model and no tools. A step that needs an agent needs your `invokeStep` (see `step-invoker.ts` in the quickstart, which builds `createAgent` and calls `send`).
- Works: signals, loops, actions, inline child workflows, timers, cancel, an in-memory event log.
- Missing: persistence, crash resume, `/approvals` routes, mail triggers, hub credentials, placement, mail-addressed runs. A crashed run is terminal.
- An approval park resolves only if you call `run.signal` yourself.
- An untimed `awaitSignal` inside a `childWorkflow` is refused, because nothing can answer it.
- Unverified: whether `onTrigger` sections run locally.

For one agent with no workflow, use `createAgent` with a git-backed `contextDir` and `@intx/tools-posix` (`use_skill interchange-agents`). There is no dedicated desktop harness. Desktop means a local process. Container, VM, Workers, and browser hosts are not shipped.

## Hub plus sidecar

- The hub is the control plane. A sidecar is a host process that dials the hub over one WebSocket (`HUB_WS_URL`), registers with an allocation token, and runs each deployment as a supervised child. It needs no public address. Use `wss://` off loopback.
- Sidecars exist only through a `SidecarProvisioner` (`ensure`, `destroy`, idempotent, generation-fenced). None is registered by default, so a fresh hub cannot deploy.
- Sidecar env: `HUB_WS_URL`, `SIDECAR_ID`, `SIDECAR_TOKEN`, `SIDECAR_DATA_DIR`, `SIDECAR_CREDENTIAL_ENCRYPTION_KEY`.
- A crashed child restarts with backoff (1 s up to 30 s). Three exits in 60 s mark it `crash-looping` and fail the run.
- Upstream dev stack: `bin/db-reset && bin/dev --seed`, hub on :3000.

## Credentials

Agents never discover credentials. The hub resolves them at launch and the harness mediates use. Inference keys travel in the `agent.deploy` frame and rotation pushes `sources.update`. Tool credentials are tenant-owned and delivered over the control channel. Proactive OAuth refresh is not built. Docs disagree on whether keys sit in `deployment.json`, so check `DEV.md` and the code.

## Placement

A workflow declares needs, and a provisioner advertises what it offers:

```ts
sidecarPlacement: {
  capabilities: [{ capability: "platform:ios", effect: "require" }];
}
```

Selectors are exact, `ns:*`, or `*`. Effects are `require` or `block`, and block wins. Tenant policy adds constraints that workflows cannot weaken. There is no OS or container sandbox yet, so grants are not a syscall or network sandbox. Untrusted work needs a provisioner declaring an `isolation:*` capability.

## Need more

- Upstream docs: `HARNESS_DESIGN.md`, `SIDECAR_PLACEMENT.md`, `CREDENTIALS.md`, `AUTH.md`, `unified-execution-host-design.md`.
- Apps that drive a hub: `use_skill interchange-client-apps`.
- Workflow authoring: `use_skill interchange-workflows`.
- Overview: `use_skill interchange`.
