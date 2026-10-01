---
name: interchange-chat
description: Build chat, run progress, signals, and approvals for an Interchange workflow in a UI. Load when a person talks to a deployed agent or workflow, or when showing run status.
user-invocable: false
---

# Chat and run observation

Chat on Interchange is mail. People and agents share one mail bus, and a deployed run has an address. Progress is a separate feed.

## Pick the feed

| Need                             | Source                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Person sends a message           | Mail to `<deploymentId>@<tenant.domain>` (`triggerWorkflowRun` or the mailbox `send`)  |
| Agent reply text                 | The person's inbox: mailbox routes and SSE (`@corbits/mailbox`)                        |
| Status, steps, parked waits      | Poll run events (`readWorkflowRunEvents`, or `createRunSession` which polls every 2 s) |
| Tool calls, reasoning            | Run events or `GET T/workflows/runs/:runId/turns`, never mail (mail is plain text)     |
| Human decision for a waiting run | `deliverWorkflowSignal` with a stable `signalId`                                       |
| Tool approval                    | `GET T/approvals`, then `POST T/approvals/:id/approve` or `/reject`                    |

## How a turn flows

1. The first mail to a run address fires the run. The hub treats inbound mail to a run address as the trigger, whether it came from the HTTP route or an agent's `mail_send`.
2. While the run lives, later mail resumes its `onTrigger` section as input. A terminal run cannot be re-fired (409).
3. Replies land in the sender's inbox and publish on the mailbox event bus. Threads follow `In-Reply-To` and `References`.

## What the host must provide

The stock hub has no mailbox routes. The host mounts `@corbits/mailbox` at `T/mailbox`, wraps the hub's `persistMail` so agent mail reaches inboxes, and supplies a `deliver` that sends run-addressed mail through `POST T/workflows/:runId/mail` with the caller's session. See `use_skill corbits-hub-libs`. Workbench `apps/hub/src/mailbox-send.ts` is the reference. The default event bus is in memory, so use a shared one for multiple replicas.

## UI

`@corbits/react-ui` `ChatThread` takes `messages` as a prop: `{ id, role: "user" | "agent" | "system", parts, createdAt }` where parts are text, reasoning, tool, or file. Write the adapter that maps inbox rows to text parts and run events to tool and reasoning parts. A person's address is the auth user id at the tenant domain, lowercased.

## Cautions

- `onTrigger` body runs can silently skip when a second top-level run of the same deployment reaches the section (upstream known limitation, INTR-552). Do not build one run per conversation on `onTrigger` without testing a second run.
- An untimed park (`awaitSignal`, or an `approval: "ask"` tool) inside a `childWorkflow` is refused. Put human waits in the top-level run or in a `loop` body.
- Agent model context lives in the sidecar's agent repo. It is not the transcript, and compaction does not touch the mail.

## Need more

- Setting up the hub and deploying: `use_skill interchange-hub-setup`.
- Mounting mailbox, artifacts, memory: `use_skill corbits-hub-libs`.
- UI components: `use_skill corbits-ui-apps`.
- Handoff between workflows: `use_skill interchange-workflows`.
