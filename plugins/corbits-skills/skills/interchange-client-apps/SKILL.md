---
name: interchange-client-apps
description: Build a web or mobile client that deploys, triggers, and watches workflows on an Interchange hub with @intx/hub-client.
user-invocable: false
---

# Interchange client apps

A client-driven app talks to a hub over HTTP. The hub owns tenants, grants, credentials, and deploys. The client never talks to a sidecar.

## Pieces

- `@intx/hub-client`: browser-side `Transport`, run session, and workflow helpers. It is side-effect free at import. `apps/admin-ui` upstream is the reference client.
- `@intx/hub-api`: the hub's Hono app. Mount extra routes on the same auth stack with `createRequireGrant`.
- `@intx/hub-agent` is sidecar-side, not a client SDK.
- API reference: the hub serves `GET /openapi.json`, and upstream `docs/API.md` is generated.

## Auth and URLs

Sign in with better-auth (cookie session, same origin). Tenant is always in the path: `/api/tenants/:tenantId/...`. Cross-tenant user views live under `/api/me/...`. Scripts that need git access use hub-issued `itx_pat_*` or `itx_svc_*` tokens.

## Deploy, trigger, watch

```ts
import {
  createBrowserTransport,
  createRunSession,
  deployWorkflow,
  triggerWorkflowRun,
  deliverWorkflowSignal,
  findAwaitingSignal,
} from "@intx/hub-client";

const transport = createBrowserTransport();
const deployment = await deployWorkflow(transport, tenantId, {
  source,
  entry: "./src/workflow.ts",
  sourceOfferingIds: [offeringId],
  defaultSourceOfferingId: offeringId,
});
await triggerWorkflowRun(transport, tenantId, runId, { content: "start" });

const session = createRunSession({
  tenantId,
  runId,
  transport,
  onChange: () => render(session.events),
});
const stop = session.start(); // polls events every 2s until terminal
// when findAwaitingSignal(session.events) returns a signal, answer it:
// await deliverWorkflowSignal(transport, tenantId, runId, { runId, signalName, signalId, payload })
```

- Sources are `asset-source`, `asset-tarball`, or `registry` (registry needs `pin: "name@range"`).
- `signalId` must be stable so retries dedupe. A terminal run cannot be retriggered.
- Errors throw `ApiError(status, code, message)`. Validate every response with arktype.
- Only a browser transport ships. A non-browser client must supply its own `Transport` that adds credentials.
- Live updates: `Transport.subscribe` uses SSE, but the shipped run session polls.
- Approvals: `GET /api/tenants/:t/approvals` with approve and reject POSTs. The docs disagree on whether these are live, so verify in the code.

## UI

Chat, run, approval, and step components exist in `@corbits/react-ui`: `use_skill corbits-ui-apps`. Scheduled and webhook runs: `use_skill corbits-hub-libs`.

## Need more

- Run topology and credentials: `use_skill interchange-run-modes`.
- Workflow authoring: `use_skill interchange-workflows`.
- Overview: `use_skill interchange`.
