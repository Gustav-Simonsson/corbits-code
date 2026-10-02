---
name: interview
argument-hint: "<topic>[; <context>]"
description: Ask the operator batched multiple-choice questions and return the Q&A.
---

# Interview

Gather input on a topic with multiple-choice questions in batches through `ask_operator`, then return the questions and answers inline. This is a utility: it does not decide what to build, write files, or invoke other skills or agents. The caller decides what to do with the findings.

## Argument

`<topic>[; <context>]`. The topic is what the interview is about. Context is facts already known; treat each as an answered dimension and do not re-ask it. If no topic is given, ask for one first.

## Process

1. **Pick dimensions.** List the open questions the topic raises, skipping what the context settles. Probe objective and priorities first, since they shape every later question.
2. **Ask in batches.** 2 to 4 questions per round, bundling independent dimensions. Use one question only when the next one cannot be written without this answer. A later question may reference an earlier answer.
3. **Stop** when every dimension is answered or out of scope, when what remains is detail the caller can decide, when the operator signals fatigue (declines, short non-answers, asks to wrap up), or when the topic has shifted. There is no fixed round cap unless the caller gave one.

**Option quality:** concrete and mutually exclusive, each a defensible choice rather than a strawman, with descriptions that surface trade-offs. Ground them in the topic and context. Use multi-select only when the dimension allows it. Put your recommendation first and label it.

**Trouble:**

- A contradiction with an earlier answer: ask one question that surfaces both choices, and record the resolution.
- "Other" reveals a missing dimension: add it and continue.
- The answers reframe the topic, or the operator has no objective at all: stop, say what you learned and why you stopped, and let the caller decide.

## Return

```
## Interview findings: <topic>

1. <question>: <answer>
2. <question>: <answer (multi-select)> — <answer>
3. <question>: deferred (user said "you decide")
```

No summary on top of the list. Then stop: no other skills, no other agents, no files.

Do not lecture between rounds, restate answers mid-interview, ask leading questions, or answer for the operator; note an assumption instead.
