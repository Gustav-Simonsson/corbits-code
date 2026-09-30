---
name: corbits-hub-libs
description: Mount Corbits hub libraries (cron, artifacts, memory, mailbox, webhooks, agent-token) and use the embedding and reranking clients. Load when adding schedules, webhooks, artifacts, memory, inboxes, or agent tokens to a hub.
user-invocable: false
---

# Corbits hub libraries

Six libraries add features to an Interchange hub. They share one shape.

## Shared pattern

- Each exports `createXRoutes(deps)`, a Hono sub-app you mount with `app.route(...)` on `@intx/hub-api`, gated by `requireGrant` (from `createRequireGrant({ grantStore, conditionRegistry })`).
- Each has `runXMigrations(dbConfig, { schema })`. On every boot run `@intx/db`'s `runMigrations` first, then these. They are idempotent and advisory-locked, so replicas are safe.
- Each owns its own Postgres schema. `schema` is the host schema holding `tenant`, `principal`, and `credential`.
- Mount paths: `/api/tenants/:tenantId/<name>`, with `artifacts` at `/api` and `webhooks` at `/api/hooks`.
- Agents reach them through a tool pack (`.../sidecar-bundle`) and run-scoped routes that use an agent token.

## Pick one

| Package                | Reach for it when                                     | Notes                                                                                                                                       |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@corbits/cron`        | An agent should run on a schedule.                    | Five-field UTC cron. No edit: delete and recreate. At most once per due minute. Pair with webhooks' deliverer.                              |
| `@corbits/webhooks`    | An outside system should trigger a run.               | Verifies Slack, Standard Webhooks, bearer. No unsigned mode. Mount outside session middleware.                                              |
| `@corbits/artifacts`   | Users or agents produce files or documents to keep.   | Versioned. Bytes go through a pluggable `ContentStore` (`InlineContentStore` uses Postgres). No UI.                                         |
| `@corbits/memory`      | Agents need shared searchable memory.                 | Needs Postgres with pgvector, and falls back to full text (`degraded`). Tools: `memory_add`, `memory_search`, `memory_list`, `memory_feed`. |
| `@corbits/mailbox`     | Humans need an inbox in the loop (approvals by mail). | For human principals. No UI and no transport: the host supplies `deliver`.                                                                  |
| `@corbits/agent-token` | A deployed agent calls back into the hub.             | Mint and revoke routes plus `requireAgentToken` middleware. Tokens last until revoked.                                                      |

## Mount example

```ts
import {
  createCronRoutes,
  createCronTicker,
  createRunTriggerCronDeliver,
} from "@corbits/cron";
import { runCronMigrations } from "@corbits/cron/migrations";

await runMigrations(dbConfig, { schema: "public" });
await runCronMigrations(dbConfig, { schema: "public" });
app.route(
  `/api/tenants/:tenantId/cron`,
  createCronRoutes({ db, requireGrant }),
);
createCronTicker({
  db,
  deliver: createRunTriggerCronDeliver(deliverer),
}).start();
```

Run one ticker per hub process. The best real wiring is upstream in `workbench/apps/hub/src/server.ts` and `migrate.ts` (note its older pins), and each README has a "Using with Interchange" section.

## Standalone clients (no hub)

- `@corbits/embedding`: `embedTexts(texts, { baseURL, model })` over any OpenAI-compatible `/v1/embeddings` (OpenAI, Ollama, TEI, vLLM, Jina). It does not store or search.
- `@corbits/reranking`: `rerankDocuments(query, docs, { baseURL, apiStyle: "tei" | "cohere" | "voyage" })` returns `{ id, score }[]`, best first. On failure keep the original order.

## Grants

Libraries declare the grants they need in `package.json` under `interchange.grantRequirements`. Give principals only what they need, for example `cron-schedule:*` create, `memory:search`, `artifact:*` create.

## Need more

- Triggering workflows from these: `use_skill interchange-workflows`.
- Chat over `@corbits/mailbox`: `use_skill interchange-chat`.
- A client UI for artifacts, mail, and runs: `use_skill corbits-ui-apps`.
- Composing a hub that mounts these: `use_skill interchange-embed-hub`. Topology and credentials: `use_skill interchange-run-modes`.
- Catalog: `use_skill corbits`.
