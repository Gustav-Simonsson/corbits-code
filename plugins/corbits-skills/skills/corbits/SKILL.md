---
name: corbits
description: Catalog of the @corbits/* packages and which one to use. Load when a task mentions a Corbits package, or needs inference providers, MCP, memory, cron, webhooks, or agent UI on Interchange.
user-invocable: false
---

# Corbits packages

Corbits publishes packages that plug into Interchange (`use_skill interchange`). Repos live at https://github.com/corbitsdev. Every package is 0.x, so a minor bump can break you, and each README has an "Upgrading from 0.1" section. License is LGPL-2.1. Runtime is Node 24+ or Bun 1.2+.

## Install rules

- `@intx/*` packages are peer dependencies pinned `^0.4.0` (this excludes 0.5). The host must resolve exactly one copy. Prefer the published packages. Vendoring is an escape hatch with a patch ledger (Corbits Code, Solution Builder, and workbench each do it), so a consumer library never uses `workspace:`.
- Trust each package's README and `package.json` over the workbench app, which pins older git SHAs.

## Pick a package

| Need                                                       | Package                                                                         | Skill                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| OpenAI Responses, Codex login, xAI login, Ollama           | `@corbits/openai-responses`, `codex-provider`, `xai-provider`, `ollama-adapter` | `use_skill corbits-inference`  |
| OAuth login (PKCE) and token refresh                       | `@corbits/oauth-core`                                                           | `use_skill corbits-inference`  |
| Typed yes/no, choice, or score decisions from a JSON state | `@corbits/system-one`                                                           | `use_skill corbits-system-one` |
| Remote MCP servers as granted tools                        | `@corbits/mcp`, `@corbits/credential-http`                                      | `use_skill corbits-tools`      |
| Gmail tools, Granola                                       | `@corbits/google-tools`, `@corbits/granola`                                     | `use_skill corbits-tools`      |
| Cron, artifacts, memory, mailbox, webhooks, agent tokens   | `@corbits/cron`, `artifacts`, `memory`, `mailbox`, `webhooks`, `agent-token`    | `use_skill corbits-hub-libs`   |
| Embeddings and reranking (no hub needed)                   | `@corbits/embedding`, `@corbits/reranking`                                      | `use_skill corbits-hub-libs`   |
| React components for chat, runs, approvals                 | `@corbits/react-ui`                                                             | `use_skill corbits-ui-apps`    |
| A full reference app                                       | workbench, Solution Builder (both private)                                      | `use_skill corbits-ui-apps`    |

Not an npm package: `subcritical` (Go, eBPF audit and sandbox for tool calls) is unreleased and unstable. Do not plan on it.

## How they plug in

- Inference packages are `@intx/inference` provider adapters. In process they go through `createDependencies`. In a sidecar they load through `SIDECAR_ADAPTER_MANIFEST`.
- Hub libraries are Hono sub-apps mounted on `@intx/hub-api`, gated by `requireGrant`, and they run their own migrations after `@intx/db`'s.
- Tool packages are sidecar bundles (`.../sidecar-bundle`) that an agent definition lists in `tools`.

## Need more

- Interchange concepts and run modes: `use_skill interchange`.
- Each skill above ends with the upstream README to read for full reference.
