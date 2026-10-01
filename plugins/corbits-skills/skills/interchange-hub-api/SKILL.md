---
name: interchange-hub-api
description: Interchange hub REST routes and request bodies (auth, tenants, roles, grants, providers, catalog, assets, deploys, runs, approvals). Load when writing code that calls a hub over HTTP.
user-invocable: false
---

# Interchange hub REST API

Live spec: `GET /openapi.json` on any running hub. Generated reference: `docs/API.md` upstream. Read those before trusting this table. Auth is a better-auth session cookie only (no bearer or API key), except git, which takes a git token.

Below, `T` = `/api/tenants/:tenantId`. Lists paginate with `?limit=&cursor=` and return `{ data, nextCursor }`.

| Step           | Call                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up / in   | `POST /api/auth/sign-up/email {name,email,password}` (422 if exists), `POST /api/auth/sign-in/email {email,password}`                                 |
| My tenants     | `GET /api/me/principals` gives `{principalId, tenantId, tenantSlug, kind, status}`; `GET /api/me`                                                     |
| Create tenant  | `POST /api/tenants {name, slug, parentId?}` (409 on slug clash, caller becomes owner with `*`/`*`)                                                    |
| Roles          | `POST T/roles {name}`, `POST T/principals/:p/roles/:r` (409 if held)                                                                                  |
| Grants         | `POST T/grants {roleId or principalId, resource, action, effect: allow/ask/deny, origin: role/creator/invoker/system}`                                |
| Invite         | `POST T/members/invite {email, roleId?}` then `PATCH T/principals/:id {status:"active"}`                                                              |
| Provider       | `POST T/providers {name, plugin, apiBaseUrl}`                                                                                                         |
| Credential     | `POST T/credentials {name, providerId, secret, type:"api_key"}`                                                                                       |
| Model          | `POST T/catalog/models {canonicalName}`                                                                                                               |
| Model provider | `POST T/catalog/providers {name, plugin, baseURL, credentialId}`                                                                                      |
| Offering       | `POST T/catalog/offerings {modelId, providerId, priority?, capabilities?, quirks?}`                                                                   |
| Asset          | `POST T/assets {kind: workflow/skill/package-registry/agent-state, name}`, `GET T/assets?kind=&inherited=`                                            |
| Git token      | `POST T/git-tokens {name, resource, refPattern, actions:["can_read","can_push"], expiresAt}` gives `secret` once                                      |
| Push code      | git over HTTP at `T/assets/:kind/:name.git`, token as the basic-auth password, push `HEAD:main`                                                       |
| Deploy         | `POST T/workflows/deployments {source:{kind:"asset",assetId,package:{format:"source",commitSha}}, entry, sourceOfferingIds, defaultSourceOfferingId}` |
| Deploy status  | `GET T/workflows/deployments` until `deployed` (failure states: `failed`, `destroy_failed`)                                                           |
| Trigger / chat | `POST T/workflows/:deploymentId/mail {content, attachments?}` gives `{runId, address, messageId}`                                                     |
| Signal         | `POST T/workflows/:deploymentId/signals {runId, signalName, signalId, payload?}`                                                                      |
| Run events     | `GET T/workflows/:deploymentId/runs`, then `.../runs/:eventRunId/events`, or `GET T/workflows/runs/:runId/events`                                     |
| Approvals      | `GET T/approvals`, `POST T/approvals/:id/approve` or `/reject` (grant `approval:<anchorRunId>`/`resolve`)                                             |

## Facts that cause bugs

- Deploy supports only `source.kind: "asset"` and needs a sidecar provisioner. Without one you get 409 `workflow_provisioning_unavailable`.
- The deploy freezes the offering chain. A different model means a new deployment.
- A provider needs `apiBaseUrl` or source-ref deploys cannot seal the credential. A model provider's credential cannot be repointed after creation.
- Resource and action pairs seen in routes: `asset:*` create/read, `workflow:*` create/read, `workflow-run:<id>` read/manage, `credential:*`/`provider:*`/`role:*`/`grant:*`/`principal:*` create/read/manage, `git-token:*` create.
- `@intx/*` tool packages resolve through a `workspace-builtins` package-registry asset. Publish it or tool closures fail. Upstream `bin/dev --seed` does this.
- `PATCH T` (tenant) checks membership only, despite docs saying admin.
- `POST /api/tenants` does not check your right to the `parentId` you name. Do not treat the tenant tree as a security boundary.
- Solution Builder's vendored hub adds `POST T/assets/:id/tree` and `GET T/assets/:id/blob`. They are not upstream, so use git when talking to a stock hub.

## Need more

- Calling these in order from an app: `use_skill interchange-hub-setup`.
- Chat and run observation: `use_skill interchange-chat`.
- Overview: `use_skill interchange`.
