---
name: interchange-agents
description: Build and embed an Interchange agent in code with tools, inference sources, and tests. Load when writing createAgent or defineAgent code.
user-invocable: false
---

# Interchange agents

Use `@intx/agent` when you want an agent inside your own program, CLI, or service. No hub is required.

## Minimal agent

```ts
import {
  createAgent,
  createDefaultDirectorRegistry,
  createStaticCredentialResolver,
  defineAgent,
  type BaseEnv,
} from "@intx/agent";
import { noopAuditStore, permissiveAuthorize } from "@intx/agent/testing";
import { createIsogitStore } from "@intx/storage-isogit/node";

const storage = await createIsogitStore(contextDir); // directory must exist
const def = defineAgent({
  id: "my-agent",
  systemPrompt: "You are a helpful assistant.",
  tools: [],
  capabilities: [],
  inference: { sources: [{ provider: source.provider, model: source.model }] },
});
const env: BaseEnv = {
  sources: [source], // { id, provider, baseURL, credentialId, model }
  defaultSource: source.id,
  storage,
  workdir: contextDir,
  audit: noopAuditStore(),
  authorize: permissiveAuthorize(),
  directors: createDefaultDirectorRegistry(),
  readCurrentMaterial: createStaticCredentialResolver({
    [source.credentialId]: apiKey,
  }),
};
const agent = await createAgent(def, env);
try {
  const result = await agent.send(prompt);
  if (result.type !== "reply")
    throw new Error(`suspended on ${result.correlationId}`);
  console.log(result.reply);
} finally {
  await agent.close();
}
```

- `send()` returns a union. Anything other than `reply` means the agent suspended on a gate (approval, pending tool) and needs an inbound message with that `correlationId`.
- `permissiveAuthorize` and `noopAuditStore` are test stubs. A product supplies a real `authorize` built on `@intx/authz` and a real audit store.
- Re-running on the same `contextDir` resumes the conversation. Clone the directory and reset `HEAD` to rewind.

## Tools

```ts
import { defineTool } from "@intx/agent";
import { posix, type PosixToolEnv } from "@intx/tools-posix/sidecar-bundle";

let disposeTools: (() => Promise<void>) | undefined;
const posixTools = defineTool<PosixToolEnv>({
  id: posix.id,
  requires: posix.requires,
  definitions: posix.definitions,
  factory: (env) => {
    const b = posix(env);
    disposeTools = b.dispose;
    return b;
  },
});
// def.tools = [posixTools]; env gains toolCwd (tree the model edits)
```

`toolCwd` is what the model reads and edits. `workdir` is the isogit storage boundary. They are different. Tool bundle lifetimes belong to the caller: dispose on close and on failed `createAgent`. LSP is a plugin passed as `{ ...env, plugins: [lsp(env)] }`. A tool can return a `pendingMarker` to open a correlation gate.

## Inference

- List several `sources` for failover across providers and protocols. `agent.setSource()` hot-swaps without interrupting a call.
- Extra providers (OpenAI Responses, Codex, xAI, Ollama) come from Corbits packages: `use_skill corbits-inference`.
- Oversize tool output spills to a blob with a `tool-output://` URI (`sizeCapMaxChars`).

## Test

Use `@intx/inference-testing` for scripted replies and to swap `fetch`. Assert on tool_result content, not just absence of crashes.

## Examples to copy (upstream `examples/`)

`agent-quickstart` (start here), `coding-agent` (posix plus LSP), `agent-resume`, `agent-rewind`, `agent-audit-log`, `agent-blob-spill`, `agent-rich-tool`, `agent-structured-payload`, `agent-multi-provider`, `agent-gemini-image`, `posix-demo` and `ring-demo` (multi-agent mail). Run with `bun --conditions=intx-src run src/cli.ts`.

## Need more

- Reactor, directors, compaction, failover: upstream `docs/INFERENCE.md`.
- Durable multi-step work: `use_skill interchange-workflows`.
- Running it somewhere other than your process: `use_skill interchange-run-modes`.
- Back to the overview: `use_skill interchange`.
