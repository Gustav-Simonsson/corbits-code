---
name: implement
description: Ship a planned, ticketed change from worktree to pushed branch with per-commit review.
argument-hint: "[ticket-id]"
---

# Implement

Take a plan and a ticket to a pushed branch. Each commit is built, gated, and reviewed before the next one starts. `/implement` does not plan; `/plan` and `/issue` come first.

Dispatch coordinates the worktree, ticket, commits, findings dispositions, and handoff. Substantive work belongs to named specialists even when it changes one file or Dispatch already explored the area. Workers start blank: give each the worktree, relevant plan and context, `success_criteria`, `do_not`, and `report_focus`; do not assume they inherited this skill.

## 1. Preflight

- Requires a git repo. Run `git rev-parse --show-toplevel`; if it fails, stop and tell the operator to `git init` first.
- Requires a plan (files, acceptance criteria, non-goals, risks, ordered steps) and a ticket. If either is missing, stop and point to `/plan` or `/issue`. An obvious mechanical correction needing no diagnosis, design, new behavior, or new tests may skip the plan but not the ticket.
- When the ticket is in Linear and Linear MCP is mounted, set it to In Progress now. If MCP is missing, say the status could not be updated.

## 2. Worktree

Work in a worktree from `origin/<default-branch>` (`use_skill("git-worktrees")`). The branch name comes from the ticket (for Linear, its `gitBranchName`). A stacked change bases on the previous branch. Do all work there, never in the main checkout.

Track the commit-sized units of the plan with `manage_tasks`.

## 3. Per commit

For each unit, in order:

1. **Approach.** For anything non-trivial, describe the approach to `spawn_agent(agent="planner")`: what changes and why, files touched, trade-offs, uncertainties. Adjust for real problems; disagree only with a reason.
2. **Implement and test.** `spawn_agent(agent="coder")` owns the unit's implementation and tests. Its brief requires the repo's test conventions: bug fixes start with a test that fails for the right reason, then the fix; features assert observable behavior. Tests and code-attached doc updates land with the code. Spawn `shakespeare` for required standalone product/architecture/implementation docs, after coder when the docs depend on its changes; do not assign concurrent writers to overlapping files. Keep scope to the unit; note other work for a later commit. Only an obvious mechanical correction under the Dispatch boundary may be DIY.
3. **Build gate.** Coder runs the project's full pipeline (format, lint, build, test) after all edits, never a partial one. Resume coder to fix failures it caused and rerun the gate after any later specialist edits. Dispatch checks the exact commands and exit statuses in the report and surfaces pre-existing failures; missing evidence is not a passing gate.
4. **Commit.** Follow `CONTRIBUTING.md` for the subject and body. No ticket ids or AI attribution in commit messages.
5. **Reviewer loop.** `spawn_agent(agent="reviewer")` on `git show HEAD` with the intent from step 1, limited to this commit's scope. Route every verified or high-confidence finding back to coder (or shakespeare for docs), rerun the build gate, and amend (or `git rebase -i` with `edit` for an earlier commit). Dispatch does not take over the fix. Repeat until clean or until what remains is a conscious decision, not an oversight.

The build must pass before every commit, amend, and rebase stop.

## 4. Dispositions

Every finding outside the current commit gets one: (a) fix here, (b) separate commit on this branch, (c) new issue filed this session with its id in the status update, or (d) accept as-is. "Out of scope" and "later" are not dispositions. Only the operator may choose (d). Decisions go through the primary, not a worker.

## 5. Whole-branch gate

When every unit has landed, run `/review` on `base..HEAD` (the whole branch, not the last commit). Fix every finding, or get an explicit operator waiver for it.

## 6. Push and hand off

Push the branch (`bin/git-push-scoped origin <branch>` when the repo has it, else `git push -u origin <branch>`). Never force-push a published branch. Then run `/pull-request` to open the PR. When the PR is ready for review, the Linear ticket moves to In Review; never Done on PR open, and never left In Review after merge when work remains.

Remove the worktree after the PR merges, or when the operator abandons the change.
