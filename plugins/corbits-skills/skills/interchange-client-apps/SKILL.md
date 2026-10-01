---
name: interchange-client-apps
description: Build a client-driven app that sets up its own Interchange hub (tenants, auth, grants, providers, installs, deploys, runs) using stock @intx and @corbits packages.
user-invocable: false
---

# Client-driven apps on Interchange

A client-driven app drives the whole setup. The hub boots vanilla (migrate, mount, serve). The app signs in, creates its tenants, grants, providers, and assets, deploys its workflows, and runs them, all over the hub's HTTP API using stock `@intx/*` and `@corbits/*` packages. Nothing about the product is baked into the hub.

The flagship example is Corbits Solution Builder (`corbitsdev/corbits-solution-builder`). Its architecture note says it directly: the client runs the installer over the hub on first launch and after every credential change. Read `packages/installer/src/*.ts` first. Workbench (`corbitsdev/workbench`) is the server-composition reference.

## The shape

- **Host** (once per launch): picks embedded or remote hub, opens the database, migrates, mints keys, mounts the hub, starts sidecar reconcilers. See `use_skill interchange-embed-hub`.
- **Client** (browser or script): everything else, through one `Transport` (`fetch(method, path, body)` plus `subscribe`).
- Keep an `install()` that is idempotent (list-then-create, tolerate 409). Run it on first launch and after changes. Solution Builder keeps it free of any database import.

## Bootstrap recipe (client side)

1. **Auth.** better-auth, email and password. `POST /api/auth/sign-up/email {name,email,password}`, on 422 `POST /api/auth/sign-in/email`. Replay the `better-auth.session_token` cookie. The REST API has no bearer or service token, so an app that acts as "system" holds a user account and keeps its cookie. A desktop app can mint one fixed local owner with a keychain-held password.
2. **Tenant.** `POST /api/tenants {name, slug, parentId?}`. The caller becomes the owner principal with `*`/`*` allow. Find existing ones via `GET /api/me` and `GET /api/me/principals`. A child tenant (`parentId`) per project inherits the parent's catalog, assets, and placement policy. Do not treat the hierarchy as a trust boundary yet: the create route does not appear to check the caller's rights on `parentId` (unverified).
3. **Roles and grants.** `POST /roles`, `POST /grants {roleId|principalId, resource, action, effect, origin}`, `POST /principals/:p/roles/:r`. Model app authorities as grants such as `authority:<name>` / `hold`. An invited member must be PATCHed to `active` before the tenant accepts them.
4. **Inference.** In order: `POST /providers` (set `apiBaseUrl`), `POST /credentials`, `POST /catalog/models`, `POST /catalog/providers` (bound to the credential), `POST /catalog/offerings`. A model provider's credential cannot be repointed, so rotate the same credential id. The offering ids are the failover chain you give each deploy.
5. **Install code.** `POST /assets {kind:"workflow"|"skill"|"package-registry", name}`. Push source through a git token (`POST /git-tokens`, `can_read` and `can_push`, short expiry, revoke after). Poll until the push is visible before deploying.
6. **Deploy.** `deployWorkflow(transport, tenantId, { source: { kind: "asset", assetId, package: { format: "source", commitSha } }, entry, sourceOfferingIds, defaultSourceOfferingId })`. The chain freezes at deploy, so a model switch is a new deployment. A deploy needs a non-empty chain and a sidecar provisioner.
7. **Run.** `triggerWorkflowRun`, then fold `readWorkflowRunEvents` (or `createRunSession`, which polls every 2 s). Answer waits with `deliverWorkflowSignal(transport, tenantId, runId, { runId, signalName, signalId, payload })`. A repeated `signalId` with a different payload is a 409. Resolve tool approvals with `POST /approvals/:id/approve` or `/reject`, which needs `approval:*` / `resolve`.

## Sharing a hub between apps

- Tenant slugs are one global namespace per hub, so prefix them: an app root tenant (`<appid>`) and child tenants per project (`<appid>-<project>-<id>`). Solution Builder finds its root by slug in `GET /api/me/principals` and creates it if absent. A slug clash returns 409, so re-resolve instead of failing.
- Catalog, providers, OAuth clients, credentials, and placement policy inherit down the tenant chain. Assets, roles, principals, and grants do not. Put shared keys in a parent tenant, and keep per-project assets, deployments, artifacts, and mail in a child.
- Do not put two apps in one tenant unless every asset and credential name is prefixed. Names are unique per tenant.
- Apps share the hub's provisioner pool, not a sidecar. Every deployment gets its own sidecar allocation.
- Every `ensure*` step adopts what exists and never overwrites. The tenant create is the only step that is not idempotent.

## Chat is mail

Chat is not a stock hub feature. The host mounts `@corbits/mailbox` (`use_skill corbits-hub-libs`).

- A person's turn is a mail send to the run address (`<deploymentId>@<tenant.domain>`). The mailbox `deliver` hook calls the hub's `POST /workflows/:runId/mail`. The first message fires the run, and later ones resume an `onTrigger` section.
- Replies arrive in the person's inbox over mailbox SSE (`/mailbox/me/inbox/events`). Threads follow `In-Reply-To` and `References`.
- Mail carries plain text only. Progress, tool calls, and approvals come from polled run events (`readWorkflowRunEvents`) and `/approvals`.
- `ChatThread` takes `messages` as a prop. You write the adapter from mail rows plus run events.
- Agent model context lives in the sidecar's agent repo and is not the transcript.

## Rules that save time

- Only the browser transport ships. Outside a browser, supply your own: base URL, cookie jar, JSON content type, `ApiError` mapping, empty 202 and 204 bodies. In process you can call `hub.app.fetch(new Request(origin + path))` with the session cookie.
- `@intx/hub-client` covers workflows only. Solution Builder's `installer/src/hub.ts` is the broader typed client for tenants, roles, grants, and the catalog. Validate every response with arktype.
- List endpoints return inherited rows. Filter assets by `tenantId` or you will adopt the parent's same-named asset. Send signals to the tenant the deployment belongs to.
- Deploy lazily, per project or stage, when the work first needs it. Do not provision everything at install.
- Client-side checks (for example guarding which grants the app may mint) are not security. The hub authorizes.
- Never put secrets in responses, logs, or prompts. Credentials are sealed by the hub's cipher.

## Need more

- Composing, embedding, and running the hub itself: `use_skill interchange-embed-hub`.
- Sidecars, placement, and credential delivery: `use_skill interchange-run-modes`.
- Workflow code you will deploy: `use_skill interchange-workflows`.
- Corbits libraries to mount (mailbox, artifacts, OAuth login, cron, memory): `use_skill corbits-hub-libs`. UI and reference apps: `use_skill corbits-ui-apps`.
- Overview: `use_skill interchange`.
