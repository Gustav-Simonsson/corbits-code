---
name: corbits-inference
description: Add OpenAI Responses, Codex, xAI, or Ollama inference and OAuth login to Interchange with the Corbits provider packages. Load when wiring a model provider or a login flow.
user-invocable: false
---

# Corbits inference and login

| Package                     | Use it for                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `@corbits/openai-responses` | Any OpenAI Responses endpoint (`/v1/responses`). Backend differences are JSON `quirks`. |
| `@corbits/codex-provider`   | ChatGPT subscription ("Login with ChatGPT") as inference. No API-key path exists.       |
| `@corbits/xai-provider`     | Grok through the grok CLI OAuth login. Those tokens only work on the CLI chat proxy.    |
| `@corbits/ollama-adapter`   | Local or cloud Ollama over `/v1/chat/completions` or `/v1/messages`.                    |
| `@corbits/oauth-core`       | PKCE plus loopback OAuth login, token refresh, and hub login routes.                    |
| `@corbits/credential-http`  | Origin-pinned credentials for any header (x-api-key, raw authorization, MCP).           |

Codex and xAI are built on `openai-responses` and `oauth-core`. Codex depends on the ChatGPT backend and is the most fragile.

## Wire an adapter in process

```ts
import { createDependencies, runInference } from "@intx/inference";
import {
  createOpenAIResponsesAdapter,
  OPENAI_RESPONSES_PROVIDER,
} from "@corbits/openai-responses";

const deps = createDependencies({
  has: (p) => p === OPENAI_RESPONSES_PROVIDER,
  resolve: (source, quirks) => createOpenAIResponsesAdapter(source, quirks),
});
const source = {
  id: "openai",
  provider: OPENAI_RESPONSES_PROVIDER,
  baseURL: "https://api.openai.com/v1",
  credentialId: "OPENAI_API_KEY",
  model: "gpt-5-mini",
};
// runInference({ deps, source, turns, nextSeq, readMaterial: (id) => ({ secret: process.env[id]! }) })
```

## Wire an adapter in a sidecar

```bash
SIDECAR_ADAPTER_MANIFEST='[{"provider":"ollama","specifier":"@corbits/ollama-adapter","export":"createOllamaAdapter"}]'
```

The hub forwards this variable to sidecars it spawns. Codex uses `createCodexResponsesAdapter` with provider id `codex`. Ollama on `/v1/messages` uses the export `createOllamaAnthropicAdapter`.

## Per-package notes

- **Codex:** name your host with `CodexQuirks { productName, environmentTagName }`. Pass the account id as `providerOptions[CODEX_ACCOUNT_ID_OPTION]`. `createDependencies` binds global fetch, so build deps by hand to install `withCodexContentTypeRepair`.
- **xAI:** for API keys use `XAI_API_KEY_BASE_URL` (`https://api.x.ai/v1`). For the OAuth login use `XAI_OAUTH_PROXY_BASE_URL` and pass the user id option.
- **Ollama:** set `reasoning` per model in mixed fleets (Ollama rejects `reasoning_effort` on non-reasoning models). It ignores `num_ctx` on `/v1`, so start the server with `OLLAMA_CONTEXT_LENGTH`.
- **oauth-core:** `loginWithProvider(...)` for CLIs. On the hub, `mountOAuthLogin` and `createOAuthTokenRefresher` from `@corbits/oauth-core/hub`. A provider is `{ oauthConfig, exchange, refresh }`, supplied by a package like codex or xai.
- **Peer ranges:** codex and xai currently peer on `oauth-core@^0.2.0` and `openai-responses@^0.2.0`, but oauth-core is 0.3.0. Check peer warnings before installing them together.

## Need more

- Typed decisions instead of chat (routing, gating): `use_skill corbits-system-one`.
- MCP servers and their credentials: `use_skill corbits-tools`.
- How sources and failover work in an agent: `use_skill interchange-agents`.
- Catalog: `use_skill corbits`.
