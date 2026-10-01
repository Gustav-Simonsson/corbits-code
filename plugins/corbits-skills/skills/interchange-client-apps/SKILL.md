---
name: interchange-client-apps
description: Decide how an app builds on an Interchange hub it drives itself, and which skill to load next. Load when building a client-driven app, a desktop agent product, or a UI over a hub.
user-invocable: false
---

# Client-driven apps

A client-driven app owns its own setup: it creates its tenants, auth, grants, providers, workflow assets, and deploys over the hub's HTTP API, using stock `@intx/*` and `@corbits/*` packages. The hub stays vanilla. Reference app: Corbits Solution Builder (`corbitsdev/corbits-solution-builder`, `packages/installer`), with workbench (`corbitsdev/workbench`) as the server-composition reference.

## Find your task

| You are...                                           | Load                    |
| ---------------------------------------------------- | ----------------------- |
| Deciding whether you need a hub at all               | `interchange-run-modes` |
| Starting the hub inside your app, or pointing at one | `interchange-embed-hub` |
| Writing the app's first-run install and deploys      | `interchange-hub-setup` |
| Calling a route and need its body                    | `interchange-hub-api`   |
| Building chat, run status, signals, approvals        | `interchange-chat`      |
| Writing the workflow the app deploys                 | `interchange-workflows` |
| Mounting mailbox, artifacts, memory, cron            | `corbits-hub-libs`      |
| Building the UI                                      | `corbits-ui-apps`       |

## Shape

- **Host**, once per launch: embedded or remote hub, migrations, keys, mount, sidecar provisioner.
- **Client**, browser or script: everything else through one `Transport`.
- **`install()`**: idempotent, runs on first launch and after changes, and imports no database code.
- **Config**: one hub-URL setting switches embedded to remote with no client change.

## Rules that save time

- Start without a hub if you only need to run a workflow in one process (`runLocal`). Move up when waits must outlive the process, credentials are shared, or triggers run while you are away.
- Deploy per project or stage, when the work first needs it. Do not provision everything at install.
- A person's chat turn is mail to the run address, not a hub chat API.
- The REST API has no service token. An app acting as "system" holds a user account and keeps its cookie.

## Need more

- Overview: `use_skill interchange`. Package catalog: `use_skill corbits`.
