import { afterEach, describe, expect, test } from "bun:test";

import { withMockedModuleDuring } from "../../testkit/mock-module.js";
import {
  buildProviderCatalog,
  refreshLiveProviderCatalog,
  refreshProviderContextWindows,
  type ProviderCatalogEntry,
} from "./index.js";
import {
  buildMainSessionSources,
  buildSubagentSources,
} from "./inference-sources.js";
import type { ResolvedProvider, Settings } from "./settings.js";
import { clearSourceCredentials } from "./source-credentials.js";
import {
  compactionThresholdFor,
  contextWindowFor,
  hasContextWindowFor,
  setModelContextWindows,
  setProviderContextWindowOverrides,
} from "../provider/context-window.js";
import { resolveLiveSessionSources } from "../session/assemble-runtime.js";
import { applyLiveModelSwitch } from "../session/live-model-switch.js";
import type { MainSessionSourceConfig } from "../session/runtime-assembly.js";
import { buildProviderSubmitHandler } from "../tui/provider/submit.js";

const active: ResolvedProvider = {
  providerName: "first",
  baseURL: "https://first.example/v1",
  apiKey: "",
  keyless: true,
  model: "shared-model",
};

function settings(): Settings {
  return {
    providers: {
      first: {
        baseURL: active.baseURL,
        keyless: true,
        models: ["shared-model"],
        contextWindow: 32_000,
      },
      second: {
        baseURL: "https://second.example/v1",
        keyless: true,
        models: ["shared-model"],
        contextWindow: 64_000,
      },
    },
  };
}

function refreshCatalog(current: Settings): Promise<ProviderCatalogEntry[]> {
  return withMockedModuleDuring(
    import.meta.resolve("./oauth-stores.js"),
    (real: typeof import("./oauth-stores.js")) => ({
      ...real,
      listCodexProfiles: async () => [],
      listXaiProfiles: async () => [],
    }),
    () => refreshLiveProviderCatalog(current, active),
  );
}

afterEach(() => {
  setModelContextWindows(undefined);
  setProviderContextWindowOverrides(undefined);
  clearSourceCredentials();
});

describe("live provider context windows", () => {
  test("an asynchronous catalog refresh respects a model switch while discovery is pending", async () => {
    const current = settings();
    const catalog = buildProviderCatalog(current, active);
    let selection = {
      providerName: active.providerName,
      model: active.model,
    };
    const discovery = Promise.withResolvers<[]>();
    await withMockedModuleDuring(
      import.meta.resolve("./oauth-stores.js"),
      (real: typeof import("./oauth-stores.js")) => ({
        ...real,
        listCodexProfiles: () => discovery.promise,
        listXaiProfiles: async () => [],
      }),
      async () => {
        const refresh = refreshLiveProviderCatalog(
          current,
          active,
          () => selection,
        );
        selection = { providerName: "second", model: "shared-model" };
        refreshProviderContextWindows(
          current,
          catalog,
          selection.providerName,
          selection.model,
        );
        discovery.resolve([]);
        await refresh;
        expect(contextWindowFor("shared-model")).toBe(64_000);
        expect(compactionThresholdFor("shared-model")).toBe(38_400);
      },
    );
  });

  test("a connected custom provider updates occupancy and compaction before restart", async () => {
    let current = settings();
    const submit = buildProviderSubmitHandler(
      "/tmp/unused-provider-context-settings.json",
      null,
      null,
      async (apply) => {
        current = apply(current);
        return current;
      },
    );
    await submit(
      {
        name: "connected",
        baseURL: "https://connected.example/v1",
        apiKey: "",
        model: "connected-model",
        oauthProfile: "",
        contextWindow: "16000",
        maxTokens: "",
        temperature: "",
        topP: "",
      },
      () => undefined,
      { skipValidation: true },
    );

    await refreshCatalog(current);
    expect(contextWindowFor("connected:connected-model")).toBe(16_000);
    expect(compactionThresholdFor("connected:connected-model")).toBe(9_600);
  });

  test("catalog refresh replaces edited overrides and removes deleted providers", async () => {
    setModelContextWindows({ "shared-model": 256_000 });
    const current = settings();
    await refreshCatalog(current);
    expect(contextWindowFor("shared-model")).toBe(32_000);
    expect(contextWindowFor("second:shared-model")).toBe(64_000);

    const first = current.providers["first"];
    if (first === undefined) throw new Error("missing first provider");
    await refreshCatalog({
      providers: { first: { ...first, contextWindow: 48_000 } },
    });
    expect(contextWindowFor("shared-model")).toBe(48_000);
    expect(contextWindowFor("first:shared-model")).toBe(48_000);
    expect(contextWindowFor("second:shared-model")).toBe(48_000);
    await refreshCatalog({
      providers: {
        first: {
          baseURL: first.baseURL,
          keyless: true,
          models: first.models,
        },
      },
    });
    expect(contextWindowFor("shared-model")).toBe(256_000);
    expect(hasContextWindowFor("first:shared-model")).toBe(true);
    expect(contextWindowFor("second:shared-model")).toBe(256_000);
  });

  test("live model switching moves bare model precedence without worker interference", () => {
    const current = settings();
    let config: MainSessionSourceConfig = {
      settings: current,
      providers: buildProviderCatalog(current, active),
      providerName: active.providerName,
      model: active.model,
    };
    resolveLiveSessionSources(config, "primary-session");
    expect(contextWindowFor("shared-model")).toBe(32_000);

    applyLiveModelSwitch(
      { providerName: "second", model: "shared-model" },
      {
        applyIdentity: (next) => {
          config = { ...config, ...next };
        },
        setPermissionIdentity: () => undefined,
        rebuildInference: () => {
          resolveLiveSessionSources(config, "primary-session");
        },
        refreshAdvertisedSchemas: () => undefined,
      },
    );
    expect(contextWindowFor("shared-model")).toBe(64_000);
    expect(contextWindowFor("first:shared-model")).toBe(32_000);
    expect(compactionThresholdFor("shared-model")).toBe(38_400);
    buildSubagentSources({
      settings: current,
      catalog: config.providers,
      head: { provider: "first", model: "shared-model" },
      sessionId: "worker-session",
    });
    expect(contextWindowFor("shared-model")).toBe(64_000);
    buildMainSessionSources({
      settings: current,
      catalog: config.providers,
      activeProvider: "first",
      activeModel: "shared-model",
      sessionId: "recovery-candidate",
    });
    expect(contextWindowFor("shared-model")).toBe(64_000);

    resolveLiveSessionSources(
      { ...config, model: "typed-model" },
      "primary-session",
    );
    expect(contextWindowFor("second:typed-model")).toBe(64_000);
    expect(contextWindowFor("typed-model")).toBe(64_000);
  });

  test("catalog model discovery updates qualified overrides and excludes OAuth projections", () => {
    const current = settings();
    current.providers["codex/work"] = {
      baseURL: "https://chatgpt.com/backend-api/codex",
      models: ["oauth-model"],
      contextWindow: 16_000,
    };
    const catalog = buildProviderCatalog(current, active).map((entry) =>
      entry.name === "first"
        ? { ...entry, models: [...entry.models, "discovered-model"] }
        : entry.name === "codex/work"
          ? { ...entry, codexProfile: "work" }
          : entry,
    );
    refreshProviderContextWindows(current, catalog, "first", "shared-model");
    expect(contextWindowFor("first:discovered-model")).toBe(32_000);
    expect(hasContextWindowFor("codex/work:oauth-model")).toBe(false);
  });

  test("switching to a provider without an override clears the prior bare model slot", () => {
    setModelContextWindows({ "shared-model": 256_000 });
    const current = settings();
    current.providers["unconfigured"] = {
      baseURL: "https://unconfigured.example/v1",
      models: ["shared-model"],
      keyless: true,
    };
    const config = {
      settings: current,
      providers: buildProviderCatalog(current, active),
      providerName: "first",
      model: "shared-model",
    };
    resolveLiveSessionSources(config, "primary-session");
    expect(contextWindowFor("shared-model")).toBe(32_000);
    resolveLiveSessionSources(
      { ...config, providerName: "unconfigured" },
      "primary-session",
    );
    expect(contextWindowFor("shared-model")).toBe(256_000);
    expect(contextWindowFor("first:shared-model")).toBe(32_000);
  });
});
