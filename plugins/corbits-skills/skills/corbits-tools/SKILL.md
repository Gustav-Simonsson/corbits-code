---
name: corbits-tools
description: Give an Interchange agent remote MCP tools, Gmail, or Granola with @corbits/mcp, credential-http, google-tools, and granola. Load when adding MCP servers or third-party tools to an agent.
user-invocable: false
---

# Corbits tool packages

Tools reach an agent as sidecar bundles listed in `tools` on `defineAgent`. The agent never holds the secret: the sidecar resolves a credential by handle and sends requests through an origin-pinned fetch.

## `@corbits/mcp`

Each tool on a remote MCP server (streamable HTTP) becomes its own agent tool named `<handle>.<tool>`, so grants apply per tool.

```ts
import { mcpListTools } from "@corbits/mcp";
import { mcpServers } from "@corbits/mcp/sidecar-bundle";

const url = "https://mcp.deepwiki.com/mcp";
const bundle = mcpServers({
  servers: [
    {
      handle: "deepwiki",
      url,
      tools: await mcpListTools(url),
      allowWithoutAsk: ["deepwiki.read_wiki_structure"],
    },
  ],
});
```

- Grants use the resource `tool:<handle>.<tool>` or `tool:<handle>.*`. Deny beats ask beats allow. Handles may not contain ".".
- Every generated tool starts as `ask`. Tools with `destructiveHint: true` can never be lowered to `allow`.
- The handle names a credential. Auth mode lives in credential `metadata.mcp.auth`: `none`, `token`, or `oauth` (login through `@corbits/oauth-core`).
- Hub side: `mountMcpDiscovery` from `@corbits/mcp/hub` adds `POST /mcp/discover`.
- Responses and frames are capped at 4 MiB, and `timeoutMs` defaults to 60 s.

## `@corbits/credential-http`

Interchange's built-in `http` credential provider only sends `authorization: Bearer`. This package adds other headers, pinned to the credential's origin, with no redirects and a fresh secret read per call.

```ts
const registry = createCredentialProviderRegistry([
  ...builtinCredentialProviders(),
  createXApiKeyCredentialProvider(),
]);
```

Presets: `createXApiKeyCredentialProvider`, `createRawAuthorizationCredentialProvider`, `createMcpStreamableHttpCredentialProvider` (keyless MCP servers use `MCP_NO_TOKEN_SENTINEL`). Then create a provider, a credential, and a grant through the hub REST API.

## `@corbits/google-tools`

Gmail only: ten tools (search, get thread or message, list labels, create or list drafts, label and unlabel). Drafts are never sent. Every tool is `approval: "ask"`.

```ts
import { gmail } from "@corbits/google-tools/sidecar-bundle";
defineAgent({
  id: "inbox-agent",
  systemPrompt,
  tools: [gmail],
  capabilities: [],
  inference,
});
```

Store the user's Google credential on the hub as `gmail-api` (scope `gmail.modify`) and grant it to the agent.

## `@corbits/granola`

Early. The npm name is `@corbits/granola` (repo `granola-tools`) and it may not be on npm yet (`bun add github:corbitsdev/granola-tools`, pin a commit). Its two tool handlers currently throw "not implemented". Use the REST client and ingest pipeline only, and verify before depending on it.

## Need more

- Credentials and push model: `use_skill interchange-run-modes`.
- OAuth login: `use_skill corbits-inference`.
- Building the agent around these tools: `use_skill interchange-agents`.
- Catalog: `use_skill corbits`.
