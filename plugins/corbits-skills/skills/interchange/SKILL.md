---
name: interchange
description: What Interchange (@intx/*) is and where to go next. Load before building on, with, or inside Interchange, or when code imports @intx packages.
user-invocable: false
---

# Interchange

Interchange (https://github.com/faremeter/interchange, LGPL-2.1, alpha, v0.4) is an agentic operating system. It runs agents as principals with their own identity, grants, and credentials. One authorization engine (`@intx/authz`) gates both API calls and tool calls. Corbits Code itself is built on it: the `@intx/*` packages are vendored under `vendor/intx-*`.

Alpha means public APIs can change before 1.0, and some docs describe the intended system, not the shipped one. The source is the truth. Check a package's `exports` before importing a subpath you have not seen used.

## Mental model

| Piece                 | What it is                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Principal and grants  | Users, agents, and workflow runs are principals. Nothing is allowed without a grant (allow, ask, deny).  |
| Agent (`@intx/agent`) | Code-driven runtime over the `@intx/inference` reactor. No hub needed. Context is a git repo.            |
| Director              | One function `(event, state) -> action` that steers the reactor loop (infer, execute tools, suspend...). |
| Tools                 | Bundles such as `@intx/tools-posix`, `-lsp`, `-mail`, gated by authz.                                    |
| Workflow              | A checkpointed DAG of agent steps, loops, and actions (`@intx/workflow`).                                |
| Hub                   | Multi-tenant control plane: tenants, grants, credentials, deploys, git server.                           |
| Sidecar               | Host process that dials out to the hub and runs each deployment as a supervised child.                   |

State is git: the audit log is the commit history, resume is re-running on the same directory, rewind is moving `HEAD`.

## Rules for building on it

- Look in `@intx/*` before writing infrastructure (logging, authz, inference, tools, state).
- Resolve exactly one copy of each `@intx/*` package. Two copies break `instanceof`.
- Validate input with arktype. No classes, no `any`, no default exports, use `create*` factories.
- The upstream gate is `make all`. Never hand-edit generated `docs/API.md`.

## Need more, go here

- Build or embed an agent in code, pick tools, sources, and test it: `use_skill interchange-agents`.
- Multi-step, durable, resumable work: `use_skill interchange-workflows`.
- Where and how it runs (local, hub plus sidecar, NAT, credentials, placement): `use_skill interchange-run-modes`.
- A web or mobile client talking to a hub: `use_skill interchange-client-apps`.
- Corbits packages that plug into it (providers, MCP, cron, memory, UI): `use_skill corbits`.
- Design docs in the upstream repo: `docs/ARCHITECTURE.md`, `INFERENCE.md`, `AUTH.md`, `CREDENTIALS.md`, `HARNESS_DESIGN.md`. Package layout: `LAYOUT.md`. Runnable references: `examples/README.md`.
