---
name: docs
description: Maintain product, architecture, and implementation docs and detect gaps.
---

# Docs

Route what the operator tells you into the right document, then find the gaps it leaves and ask about them. This is not a filing system: recording the input is half the job.

Dispatch owns classification, operator questions, and synthesis. `spawn_agent(agent="shakespeare")` owns substantive documentation authorship and cross-document consistency; only obvious mechanical corrections may be DIY. Give shakespeare the input, relevant document paths and context, `success_criteria` covering the steps below, `do_not` forbidding product-code changes or unapproved document creation, and `report_focus` requesting contradictions and gaps. Workers start blank; include the applicable instructions. After operator answers, resume shakespeare with those decisions rather than taking over its edits.

## Documents

Look for `PRODUCT.md`, `ARCHITECTURE.md`, and `IMPLEMENTATION.md` (case-insensitive) in the repo root and `docs/`. Prefer the root when both exist. Create missing ones in the root after confirming with `ask_operator`.

| Document       | Holds                                                                                   | Signals                                    |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Product        | What we build and why: users, value, goals                                              | "users can", needs, benefits, no mechanism |
| Architecture   | Structure: components, interfaces, data and control flow, technology-agnostic decisions | parts and how they interact                |
| Implementation | Concrete choices: technologies, protocols, formats, config, deployment                  | "uses", "built on", named libraries        |

Have shakespeare read the existing documents first. Their vocabulary beats the general signals above: a term the architecture doc already owns routes to architecture.

## Steps

1. **Read** the existing documents for terms, patterns, and similar entries to copy.
2. **Classify** the input. When it is clear, go to step 3. When it is ambiguous or spans documents, do not ask "which document?". Name the product, architecture, and implementation aspects you see and ask targeted questions that separate them.
3. **Update** the target document in its own voice and level of detail. If the new content contradicts existing content, ask whether to replace, keep both with clarification, or merge.
4. **Check consistency** across the other documents and fix or flag what the change makes stale.
5. **Find gaps** (significant updates only): concepts referenced but not explained, thin sections, missing failure modes or limits, decisions without rationale. Ask 2 to 4 probing questions in one batch with options drawn from the documents. Update with the answers. If the operator declines, move on.

## Asking

Use `ask_operator` with batched questions and context-aware options (reference similar documented features, earlier answers, and project terms). Fall back to general options only when the documents are empty.
