---
name: implement
description: Ship a planned, ticketed change from worktree to pushed branch with per-commit review.
argument-hint: "[ticket-id]"
---

# Implement

Take a plan and a ticket to a pushed branch. Each commit is built, gated, and reviewed before the next one starts. `/implement` does not plan; `/plan` and `/issue` come first.

## 1. Preflight

- Requires a git repo. Run `git rev-parse --show-toplevel`; if it fails, stop and tell the operator to `git init` first.
- Requires a plan (files, acceptance criteria, non-goals, risks, ordered steps) and a ticket. If either is missing, stop and point to `/plan` or `/issue`. A tiny change the primary does itself may skip the plan but not the ticket.
- When the ticket is in Linear and Linear MCP is mounted, set it to In Progress now. If MCP is missing, say the status could not be updated.

## 2. Worktree

Work in a worktree from `origin/<default-branch>` (`use_skill("git-worktrees")`). The branch name comes from the ticket (for Linear, its `gitBranchName`). A stacked change bases on the previous branch. Do all work there, never in the main checkout.

Track the commit-sized units of the plan with `manage_tasks`.

## 3. Per commit

For each unit, in order:

1. **Approach.** For anything non-trivial, describe the approach to `spawn_agent(agent="planner")`: what changes and why, files touched, trade-offs, uncertainties. Adjust for real problems; disagree only with a reason.
2. **Implement and test.** Follow the repo's test conventions. Bug fixes start with a test that fails for the right reason, then the fix. Features get a test that asserts the designed behavior. The test lands in the same commit as the code, and so do doc updates the change requires. Keep scope to the unit; note other work for a later commit.
3. **Build gate.** Run the project's full pipeline (format, lint, build, test), never a partial one. Fix failures you caused. Report pre-existing failures to the operator. Record the commands and exit statuses.
4. **Commit.** Follow `CONTRIBUTING.md` for the subject and body. No ticket ids or AI attribution in commit messages.
5. **Reviewer loop.** `spawn_agent(agent="reviewer")` on `git show HEAD` with the intent from step 1, limited to this commit's scope. Fix every verified or high-confidence finding, re-run the build gate, and amend (or `git rebase -i` with `edit` for an earlier commit). Repeat until clean or until what remains is a conscious decision, not an oversight.

The build must pass before every commit, amend, and rebase stop.

## 4. Dispositions

Every finding outside the current commit gets one: (a) fix here, (b) separate commit on this branch, (c) new issue filed this session with its id in the status update, or (d) accept as-is. "Out of scope" and "later" are not dispositions. Only the operator may choose (d). Decisions go through the primary, not a worker.

## 5. Whole-branch gate

When every unit has landed, run `/review` on `base..HEAD` (the whole branch, not the last commit). Fix every finding, or get an explicit operator waiver for it.

## 6. Push and hand off

Push the branch (`bin/git-push-scoped origin <branch>` when the repo has it, else `git push -u origin <branch>`). Never force-push a published branch. Then run `/pull-request` to open the PR. When the PR is ready for review, the Linear ticket moves to In Review; never Done on PR open, and never left In Review after merge when work remains.

Remove the worktree after the PR merges, or when the operator abandons the change.
