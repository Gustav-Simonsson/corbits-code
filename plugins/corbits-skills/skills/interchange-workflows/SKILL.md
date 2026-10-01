---
name: interchange-workflows
description: Author, test, and deploy Interchange workflows (defineWorkflow, step, loop, action). Load when writing or debugging @intx/workflow code.
user-invocable: false
---

# Interchange workflows

A workflow is a DAG of steps that the runtime schedules, checkpoints to an append-only event log, and resumes after a crash. The definition is data, so the deploy system can hash it, show its grants, and freeze what was approved.

## Shape

```ts
import { defineAgent } from "@intx/agent";
import { action, defineWorkflow, escalation, loop, step } from "@intx/workflow";

const pass = defineWorkflow({
  // loop body: keep it module-private
  id: "revision-pass",
  trigger: { type: "manual" },
  steps: {
    shorten: step({ agent: editorAgent, input: { from: "trigger.payload" } }),
  },
});

export const workflow = defineWorkflow({
  // the ONE exported definition
  id: "tagline-review",
  trigger: { type: "manual" },
  steps: {
    revise: loop({
      body: pass,
      while: "stillTooLong",
      carry: "nextPass",
      input: { from: "trigger.payload" },
      maxIterations: 4,
      onExhausted: "giveUp",
    }),
    publish: action({
      handler: "publishTagline",
      effect: { requires: ["fs:write"] },
      input: { from: "steps.revise.output.final.shorten" },
      after: ["revise"],
    }),
    giveUp: escalation({ to: "editor@example.com", after: ["revise"] }),
  },
});
```

Primitives: `step`, `map`, `gate`, `awaitSignal`, `sleep`, `childWorkflow`, `escalation`, `action`, `loop`, `onTrigger`. Triggers are `mail` and `manual` (`schedule` is rejected; use `@corbits/cron`). Inputs use selectors such as `{ from: "steps.<id>.output.<path>" }`.

The package manifest names the modules: `"interchange": { "workflow": "./src/workflow.ts", "loops": "./src/loops.ts", "actions": "./src/actions.ts" }`. Loop functions and action handlers resolve by export name.

## Rules that bite

- The workflow module exports exactly one definition.
- Agent step output is `{ reply, turn }`. Parse structured output in an `action`.
- Actions get no default input, and handlers get only `(input, ctx, signal)`. Do every effect through `ctx.perform({ effectId, capability, run })`, keep it idempotent, and list the capability in `effect.requires`.
- On convergence a loop breaks before `carry`: `carry` is the last iteration's input, `final` is its output.
- Untimed parks (`awaitSignal` with no timeout, tools needing approval) are refused under a `childWorkflow`.
- Declare needed grants with `grantRequirements` (`source: "creator"` or `"invoker"`).

## Test locally

```ts
const run = runLocal(workflow, {
  authorize: allowAll,
  hasUpstreamSignalResolver: true,
  triggerPayload,
  loopFns,
  actionResolver,
  invokeStep: createAgentStepInvoker({
    source,
    material,
    contextDir,
    authorize: allowAll,
  }),
});
const result = await run.complete; // { runId, terminalStatus, outputs }
```

`runLocal` is in memory. Its default step invoker runs no inference, so pass your own or script replies with `@intx/inference-testing`.

## Deploy

`POST /api/tenants/:t/workflows/deployments` installs, probes (on an airlocked sidecar), gates on the operator's approval set, freezes, then provisions a sidecar. Trigger with `/:runId/mail`, answer waits with `/:runId/signals`. The in-tree hub registers no provisioner, so it cannot deploy until one is injected: `use_skill interchange-run-modes`.

## Handoff between workflows

There is no primitive that starts or signals another deployment from inside a workflow. Choose by need:

| Need                                     | Use                                                          |
| ---------------------------------------- | ------------------------------------------------------------ |
| Human turn into a run                    | Mail to the run address                                      |
| Human decision into a parked run         | `deliverWorkflowSignal` with a stable `signalId`             |
| Agent to agent, conversational           | `mail_send` to the peer's run address (unverified: triggers) |
| Bounded sub-task, no human               | `childWorkflow` (an untimed park inside fails the child)     |
| Rework loop with a human gate in one run | `loop` with `awaitSignal` in the body                        |
| Many human turns in one living run       | `onTrigger` section                                          |
| Large or durable content                 | Artifact or memory reference plus sha256, not the payload    |
| Start a different deployment             | The client or host (ensure deploy, then trigger)             |

Solution Builder orchestrates from the client: it mails per-stage specialists, sends `project.decision` signals to one project workflow, and passes artifact references. On redeploy it starts a new generation and replays recorded decisions through it.

## Need more

- Full pitfall list: upstream `docs/WORKFLOW_AUTHORING.md` and `examples/workflow-quickstart`.
- Driving deploys from an app: `use_skill interchange-client-apps`.
- Scheduled or webhook-triggered runs: `use_skill corbits-hub-libs`.
- Overview: `use_skill interchange`.
