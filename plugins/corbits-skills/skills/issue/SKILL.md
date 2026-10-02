---
name: issue
description: Find or create the issue for this work in Linear, GitHub, or GitLab.
argument-hint: "[description] [--from-doc]"
---

# Issue

Check whether the work already has an issue. If it does, report it. If not, draft one and create it.

Ask with `ask_operator`. Use the mounted tracker tools as they appear in the toolset; do not restate their names or schemas, and do not invent a REST client.

## 1. Pick the tracker

1. Linear MCP tools mounted: Linear. Do not ask.
2. Else read `.corbits/MEMORY.md` for `Preferred issue tracker:` and use it.
3. Else ask: GitHub, GitLab, Linear (enable MCP), or other. Save the answer as `Preferred issue tracker: <name>` in `.corbits/MEMORY.md`, never secrets.
4. GitHub uses `gh`, GitLab uses `glab`, both through `bash`. If the CLI is missing, tell the operator and stop. Linear without MCP: tell the operator to enable it and stop.

## 2. Look for an existing issue

Search the tracker for the ticket id in the branch name, then for the description's key terms. If a match covers the work, show it and stop. If it is close but incomplete, ask whether to update it or file a new one.

## 3. Draft

With `--from-doc` or a named planning document, read it (`PRODUCT.md`, `ARCHITECTURE.md`, `IMPLEMENTATION.md`, a `/plan` output) and draft from it. Otherwise draft from the operator's description and what the repo shows. Ask only for what you cannot infer.

**Title:** a clear, actionable phrase ("Add retry logic for failed API calls", not "API retry").

**Description:**

```
# Background

Why this matters and the current state. Include reproduction steps for a bug.

# Outcome

- [ ] Observable, verifiable result
- [ ] Another result
```

Split work that is really several independent outcomes into separate issues, and on Linear group them under a project when the operator asks for one. Scope one issue to one reviewable PR.

## 4. Create

Create the issue and report its id and URL. On Linear, attach planning documents to the issue (or project for whole-project specs) and point descriptions at the attachment, not a local path. On GitHub or GitLab, paste the meaning into the body or link a permanent URL.
