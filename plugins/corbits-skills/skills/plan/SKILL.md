---
name: plan
description: Author an eng change plan. Does not implement or file issues.
---

# Plan

How to produce an engineering change plan. Does not implement. Does not file tracker issues.

Requires a git repo. Run `git rev-parse --show-toplevel`; if it fails, stop and tell the operator to `git init` first.

If the change target is too fuzzy to plan, `ask_operator` first. To learn the code before planning, use `spawn_agent(agent="explorer")`; to pressure-test the approach, `spawn_agent(agent="planner")`.

## What the plan must contain

1. Files / paths to touch
2. Acceptance criteria mapped from the ask
3. Non-goals
4. Risks and open questions
5. Ordered steps a later `/implement` can execute without guessing

When requirements are fuzzy, put open questions under Blockers instead of inventing scope.

## What this is not

- Not `/issue`. If the operator wants tickets, they use `/issue` after the plan.
- Not an architecture gate. Planner reviews approach; this skill only authors the plan.
- Not implementation. Do not ship the change.

The plan is the input to `/issue` (the ticket) and `/implement` (which needs both). End by telling the operator the next step.
