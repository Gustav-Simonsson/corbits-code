---
name: git-worktrees
user-invocable: false
disable-model-invocation: true
description: Create and tear down a worktree from origin/<default-branch>. Load via use_skill.
---

# git-worktrees

Every workflow that writes code or checks out a branch (`/implement`, `/refactor`, and `/review` of a PR) works in a worktree, not the main checkout. Load this with `use_skill("git-worktrees")` and run the commands through `bash`. Tear the worktree down after the PR merges or the change is abandoned.

## Create from origin/<default-branch>

```bash
git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
git fetch origin
git worktree add ../worktree/<branch-name> -b <branch-name> origin/<default-branch>
```

Always base new branches on `origin/<default-branch>` (whatever the repository uses); a stacked branch bases on the previous branch instead. After creating the worktree, `cd` into it and install local dependencies (`bun install` when the project uses Bun; otherwise follow developer docs). Worktrees do not share `node_modules`.

## Teardown

```bash
cd <path-to-main-repo>
git fetch origin
git worktree remove ../worktree/<branch-name>
git branch -d <branch-name>
```

If the worktree directory was already deleted: `git worktree prune`.
