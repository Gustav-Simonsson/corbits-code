---
name: native-integration
description: Corbits rules for Linear status, tracker-agnostic issues, and posting reviews on GitHub
user-invocable: false
---

# Native integration

Corbits-specific rules that the other skills rely on. Load alongside `style` and `philosophy`. Workers get this body baked; the primary loads it with `use_skill`.

## Test runner

Corbits tests use `bun:test` (`bun test`, `bun run test`). Agent commands run through `bash`.

## Fleet

Spawn with `spawn_agent(agent=<director>)` and a closed director id; `intent="general"` is not a spawn.

Substantial coder work consumes a planner or `/plan` plan (files, acceptance criteria, non-goals, risks, ordered steps) and blocks if that plan is missing. Tiny parent-DIY work stays plan-optional. `/plan` and planner author; they do not ship. Disposition decisions in `/implement` go through the primary, not a worker.

## Linear claim-first

When the work tracks a Linear issue and Linear MCP is available, set the issue to In Progress before explore/build thrash. Parallel lanes claim their own IDs. Use `use_skill("git-worktrees")` to create the worktree.

Move the issue to In Review when the PR is ready for review. Draft or WIP PRs stay In Progress. Never mark the issue Done on PR open, and do not leave it In Review after merge when work remains. If Linear MCP is unavailable, report that status could not be updated.

`linear-issue-workflow` owns the full Linear ship loop.

## Tracker-agnostic issues

`/issue` is not Linear-only:

1. Linear MCP available: Linear.
2. Else ask which tracker (GitHub, GitLab, other) unless `.corbits/MEMORY.md` already has `Preferred issue tracker`.
3. Persist that preference in MEMORY.md (never secrets).
4. GitHub: `gh issue create`. GitLab: `glab issue create`.

Do not restate MCP tool names or schemas in chat. Call the tools.

## Post the review on GitHub

When the branch under review has an open GitHub pull request, **post the finished review on the PR**. A review that only lives in the chat session is not done.

This step is the delivery of the review, not a second pass of analysis. By the time you post, findings are already decided. Do not reopen the read while drafting the body.

### When to post

Post when any of these is true:

- The user asked for a PR review (a PR URL or an explicit "review #N")
- `linear-issue-workflow` Phase 5 self-review has cleared and Phase 6 is opening or updating the PR
- An open PR exists for the branch and the review's purpose is to leave a record on it

Do **not** post when the user only asked for a private/local read with no PR, or when the branch has no open PR and creating one is out of scope.

### Multi-persona reviews

When the workflow ran more than one review lens (for example `reviewer` for behavioral/architecture, `planner` for waivers or product judgment, an OSS/quality agent for packaging and public-API bar), each lens that produced a distinct judgment **posts its own review**. Do not collapse independent verdicts into one mushy "team thinks" paragraph.

| Lens                   | What it owns                                                       | When to post                                                                                |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Primary / orchestrator | Verdict on the branch as it stands; residual findings; waiver list | Always when posting                                                                         |
| Reviewer               | Behavioral bugs, missing tests, architecture, commit coherence     | When a reviewer director ran                                                                |
| Planner                | Waiver rulings and intentional exceptions                          | When the planner authorized any waiver, or when product/architecture judgment was requested |
| OSS / quality          | Public-API, packaging, polish bar for shippable surface            | When that lens was explicitly run                                                           |

Same GitHub account is fine. Label each post so a human can tell which lens spoke. Prefer separate `gh pr review` / `gh pr comment` posts over one mega-comment when more than one lens has substance.

If only the primary review ran, post once. Do not invent extra personas.

### Command

Use a real GitHub review, not a floating issue comment, for the primary verdict:

```bash
# Approve — branch is ready to merge as it stands
gh pr review <number-or-url> --approve --body "$(cat <<'EOF'
<body>
EOF
)"

# Comment — findings or notes that do not block merge by themselves
gh pr review <number-or-url> --comment --body "$(cat <<'EOF'
<body>
EOF
)"

# Request changes — at least one finding must be fixed before merge
gh pr review <number-or-url> --request-changes --body "$(cat <<'EOF'
<body>
EOF
)"
```

Secondary persona posts may use `gh pr review --comment` or `gh pr comment`. Prefer `gh pr review --comment` so they appear in the Reviews timeline. Never `--approve` from a secondary lens that did not own the merge verdict.

### Body shape (no AI slop)

Write like a senior engineer leaving a review on a busy PR. Short. Specific. Present tense. No journey narration.

**Required shape:**

```markdown
## <Lens> · <Approve | Comment | Request changes>

<one line: what the branch does, present tense — not how it got there>

### Findings

- `path/to/file.ts:12` — <concrete problem and why it matters>
- `path/to/other.ts:40` — <…>

### Notes

- <optional; only load-bearing context the author needs>
```

When the review is clean:

```markdown
## Review · Approve

Hub list/get/upload under `/api/tenants/:id/artifacts`; Library reads that plane.

No findings.
```

**Hard bans** (delete on sight before posting):

- Throat-clearing: "Great work", "Thanks for this", "Overall this looks solid", "Happy to approve"
- AI filler: "I'd like to highlight", "It's worth noting", "In conclusion", "Going forward"
- Journey talk: "this PR adds… then fixes… after feedback…"
- Fake balance: praising three things to soften one finding
- Emoji, decorative headers, horizontal rules used as ornament
- Restating the diff file-by-file when there is no finding
- "LGTM" alone with no one-line present-tense description of what the branch does

**Findings rules:**

- Every finding has a `path:line` (or `path` when line is meaningless) and a concrete failure mode
- Severity is the review action (`--request-changes` vs `--comment`), not adjectives in the body
- No "nit:" / "minor:" / "suggestion:" as a way to smuggle unactionable taste — if it is not worth the author's time, drop it

### After posting

Paste the review URL(s) back to the user. Do not mark the Linear issue Done. `--request-changes` is not merge-ready. While the PR is open and ready for review, the issue stays In Review — including after `--request-changes`. Do not ping-pong it back to In Progress. The Linear claim-first section above owns the In Review write; posting a GitHub review does not set Linear state.
