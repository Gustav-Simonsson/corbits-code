---
name: pull-request
description: Find or open the pull request for the current branch.
argument-hint: "[--draft]"
---

# Pull request

Check whether the current branch already has a PR. If it does, report it. If not, open one.

Requires a git repo and a branch other than the default branch. Stop and say so otherwise.

## 1. Look for an existing PR

```bash
gh pr view --json url,state,isDraft,baseRefName
```

If an open PR exists, report its URL, state, and base, offer to refresh the title or body if the branch has changed, and stop. On GitLab use `glab mr view`.

## 2. Prepare the branch

- Working tree clean, or ask what to do with the changes.
- Branch pushed to the remote: `bin/git-push-scoped origin <branch>` when the repo has it, else `git push -u origin <branch>`. Never force-push a published branch.
- A ticket exists for the work. If none, run `/issue` first.
- For a stacked branch, base on the previous branch, not the default branch.

## 3. Write the PR

Read `CONTRIBUTING.md` and follow its title and body rules. Describe the whole branch, not its latest commit:

```markdown
## Summary

- What changed and why, present tense.

## Verification

- The checks you ran and what they showed.

Fixes <ticket>
```

Use `--draft` for work in progress.

## 4. Open and report

```bash
gh pr create --base <base> --head <branch> --title "<title>" --body-file <file>
```

Report the URL. When the PR is ready for review (not draft), set a tracked Linear issue to In Review. Draft or WIP PRs keep the issue In Progress. Never mark the issue Done on open.
