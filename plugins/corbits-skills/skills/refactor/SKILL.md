---
name: refactor
argument-hint: <directory>
description: Document a directory's design and plan improvements with the operator.
---

# Refactor

Use this skill to analyze existing code, produce a structured design document, and collaboratively plan improvements for future implementation.

## Preflight

Requires a git repo. Run `git rev-parse --show-toplevel`; if it fails, stop and tell the operator to `git init` first. Work in a worktree from `origin/<default-branch>`, never in the main checkout: `use_skill("git-worktrees")` for the commands.

## Workflow

### Step 1: Understand the Scope

The user has specified a directory to analyze: `$ARGUMENTS`

If the directory is broad, ask clarifying questions:
- Is there a specific concern or area they want to focus on?
- What prompted the desire to refactor?
- Are there known pain points?

### Step 2: Examine the Code

Explore the specified directory to understand:
- What the code does (purpose and behavior)
- Key components and their responsibilities
- How data flows through the system
- Dependencies (internal and external)
- Patterns and conventions in use
- Areas of complexity or inconsistency

### Step 3: Document Current Design

Write a structured markdown document to the current working directory. Choose a filename that reflects what was analyzed.

Document structure:

**Overview** - What this code does and its role in the larger system

**Components** - Key parts and their responsibilities

**Data Flow** - How data moves through the system

**Dependencies** - What it relies on

**Patterns** - Design patterns and conventions observed

**Observations** - Complexity, inconsistencies, or potential concerns (factual, not prescriptive)

### Step 4: Collaborative Improvement Discussion

After documenting the current state:

1. Present your observations and ask the user about their priorities
2. Propose specific improvements with rationale grounded in the principles below (pragmatic, simple over easy, etc.)
3. Let the user accept, reject, or modify proposals
4. Ask follow-up questions to refine the approach
5. Iterate until alignment is reached

### Step 5: Write the Plan

Append an **Improvement Plan** section to the document with:

- Specific changes to make
- Rationale for each change
- Suggested order of operations
- Any constraints or risks to be aware of
- Enough detail that another agent could execute the plan

## Output

A single markdown file in the user's current working directory containing both the design analysis and the improvement plan.

## Guiding Principles

- **Pragmatic over idealistic** - Don't propose changes for theoretical purity
- **Simple is usually harder than easy** - Favor designs that are genuinely simple, not just quick
- **Do no harm** - Consider risks to stability and correctness
- Respect existing decisions; understand why things are the way they are before proposing changes
