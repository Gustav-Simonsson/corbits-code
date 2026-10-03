---
name: plan
description: Author an eng change plan. Does not implement or file issues.
---

# Plan

How to produce an engineering change plan. Does not implement. Does not file tracker issues.

Requires a git repo. Run `git rev-parse --show-toplevel`; if it fails, stop and tell the operator to `git init` first.

If the change target is too fuzzy to plan, `ask_operator` first. Dispatch owns clarification and synthesis, not substantive plan authorship. Use `spawn_agent(agent="explorer")` for broader codebase mapping when needed, then `spawn_agent(agent="planner")` to author the plan and pressure-test the approach. Give planner the operator's requirements, explorer findings, relevant paths, output location, `success_criteria` covering the five sections below, `do_not` forbidding implementation and ticket creation, and `report_focus` naming decisions and blockers. Workers start blank; include the applicable instructions rather than assuming they inherited this skill.

## What the plan must contain

1. Files / paths to touch
2. Acceptance criteria mapped from the ask
3. Non-goals
4. Risks and open questions
5. Ordered steps a later `/implement` can execute without guessing

When requirements are fuzzy, put open questions under Blockers instead of inventing scope.

## What this is not

- Not `/issue`. If the operator wants tickets, they use `/issue` after the plan.
- Not an implementation gate. Planner authors the plan and reviews its approach; Dispatch presents it and resolves operator questions.
- Not implementation. Do not ship the change.

The plan is the input to `/issue` (the ticket) and `/implement` (which needs both). End by telling the operator the next step.
