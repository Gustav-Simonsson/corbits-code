---
name: interchange-hub-setup
description: Write the app-side install() that signs in, creates tenants, grants, providers, assets, and deploys workflows on an Interchange hub. Load when an app must set up its own hub.
user-invocable: false
---

# App-driven hub setup

The app, not an operator, sets the hub up. It talks to a stock hub over HTTP, the same code for an embedded or a remote hub (`use_skill interchange-run-modes`). Write one idempotent `install()`, run it at first launch and after any credential change.

## Before you start

- `@intx/hub-client` and `@intx/hub-app` are private, not on npm. Copy the small `Transport` below, or vendor the upstream workspace as Solution Builder does. `@intx/hub-api`, `hub-sessions`, `db`, and `workflow` are published.
- Check `GET /openapi.json` on a running hub for current bodies (`use_skill interchange-hub-api`).

## The transport

`createBrowserTransport` has no base URL or cookie jar, so outside a browser write your own. It must send JSON, replay cookies, turn errors into an `ApiError(status, code, message)`, and return `undefined` for an empty 202 or 204.

```ts
const jar = new Map<string, string>();
export const transport: Transport = {
  async fetch(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    if (!res.ok) throw await toApiError(res);
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  },
  subscribe() {
    throw new Error("poll run events instead");
  },
};
```

Set `BASE` to the exact origin in the hub's `BETTER_AUTH_BASE_URL`, or sign-up fails the CSRF check. Validate every response with arktype.

## The install order

Each step lists, then creates if missing, and adopts what exists:

1. Sign up, on 422 sign in. Keep the cookie. The app holds a user account as its "system" identity.
2. Find or create the app root tenant by slug in `GET /api/me/principals`. Slugs are global across the hub, so prefix with your app id. On 409, look it up again.
3. Seed roles and grants.
4. Seed inference: provider, credential, model, model provider, offering. Keep the offering ids.
5. Create a workflow asset, mint a short-lived git token, push the workflow package, revoke the token, and read the commit sha.
6. Deploy lazily, when the work first needs it:

```ts
const d = await deployWorkflow(transport, tenantId, {
  source: { kind: "asset", assetId, package: { format: "source", commitSha } },
  entry: "src/workflow.ts",
  sourceOfferingIds: offeringIds,
  defaultSourceOfferingId: offeringIds[0],
});
// poll listWorkflowDeployments until status === "deployed"
```

7. Run with `triggerWorkflowRun(transport, tenantId, d.id, { content })`. Observe with `use_skill interchange-chat`.

`deployWorkflow`, `triggerWorkflowRun`, `deliverWorkflowSignal`, `listWorkflowDeployments`, `readWorkflowRunEvents` are the hub-client helpers. The rest are plain `transport.fetch` calls, so write a small typed wrapper per route.

## Design rules

- One root tenant per app, one child tenant per project. Catalog, providers, credentials, and placement inherit down. Assets, roles, and grants do not, so filter asset lists by `tenantId` or you adopt the parent's same-named asset.
- Prefix asset and credential names if two apps ever share a tenant.
- Apps share the hub's provisioner pool. Every deployment gets its own sidecar.
- Client-side permission checks only explain. The hub authorizes.
- Secrets never go in responses, logs, or prompts.

Reference app: `corbitsdev/corbits-solution-builder`, `packages/installer/src/install.ts` and `hub.ts`.

## Need more

- Route bodies: `use_skill interchange-hub-api`.
- The hub process itself (embedded or remote): `use_skill interchange-embed-hub`.
- Chat, runs, and approvals: `use_skill interchange-chat`.
- Workflow code you push: `use_skill interchange-workflows`.
