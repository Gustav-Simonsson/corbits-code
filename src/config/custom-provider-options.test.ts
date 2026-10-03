import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildProviderCatalog,
  refreshProviderContextWindows,
} from "./index.js";
import { buildMainSessionSources } from "./inference-sources.js";
import { loadSettings } from "./settings.js";
import { clearSourceCredentials } from "./source-credentials.js";
import {
  contextWindowFor,
  setProviderContextWindowOverrides,
} from "../provider/context-window.js";
import { createOpenAICompatibleAdapter } from "../provider/openai-compatible-adapter.js";
import { buildProviderSubmitHandler } from "../tui/provider/submit.js";
import type { ProviderFormValues } from "../tui/provider/types.js";

afterEach(() => {
  clearSourceCredentials();
  setProviderContextWindowOverrides(undefined);
});

test("edited custom reasoning and sampling options persist and reach the request together", async () => {
  const dir = await mkdtemp(join(tmpdir(), "custom-provider-options-"));
  try {
    const path = join(dir, "settings.json");
    const values: ProviderFormValues = {
      name: "combined",
      baseURL: "https://combined.example/v1",
      apiKey: "",
      model: "custom-only",
      oauthProfile: "",
      reasoningEfforts: ["medium", "high"],
      defaultReasoningEffort: "high",
      contextWindow: "32000",
      maxTokens: "4096",
      temperature: "",
      topP: "0.9",
    };
    await buildProviderSubmitHandler(path, null, null)(
      values,
      () => undefined,
      { skipValidation: true },
    );
    const original = await loadSettings(path);
    if (original === null) throw new Error("missing original settings");
    const catalog = buildProviderCatalog(original, {
      providerName: values.name,
      baseURL: values.baseURL,
      apiKey: "",
      keyless: true,
      model: values.model,
    });

    await buildProviderSubmitHandler(path, original, null)(
      {
        ...values,
        reasoningEfforts: ["low", "max"],
        defaultReasoningEffort: "max",
        contextWindow: "64000",
        maxTokens: "8192",
        temperature: "0",
        topP: "",
      },
      () => undefined,
      { skipValidation: true },
    );
    const settings = await loadSettings(path);
    if (settings === null) throw new Error("missing edited settings");
    expect(Object.keys(settings.providers)).toEqual(["combined"]);
    expect(settings.providers["combined"]).toMatchObject({
      models: ["custom-only"],
      reasoningEfforts: ["low", "max"],
      defaultReasoningEffort: "max",
      contextWindow: 64_000,
      maxTokens: 8192,
      temperature: 0,
    });
    expect(settings.providers["combined"]?.topP).toBeUndefined();
    refreshProviderContextWindows(settings, catalog, values.name, values.model);
    expect(contextWindowFor("combined:custom-only")).toBe(64_000);

    // Discovery can still hold the old declaration when an edited row is used.
    for (const reasoningEffort of [undefined, "medium"] as const) {
      const source = buildMainSessionSources({
        settings,
        catalog,
        activeProvider: values.name,
        activeModel: values.model,
        sessionId: "combined-session",
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      }).sources[0];
      if (source === undefined) throw new Error("missing source");
      const adapter = createOpenAICompatibleAdapter({
        sourceId: source.id,
        provider: source.provider,
        model: source.model,
      });
      const body = JSON.parse(
        adapter.buildRequest([], source.model, source.defaults ?? {}).body,
      ) as Record<string, unknown>;
      expect(body.reasoning_effort).toBe("max");
      expect(body.max_tokens).toBe(8192);
      expect(body.temperature).toBe(0);
      expect(body).not.toHaveProperty("top_p");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
