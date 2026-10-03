import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./index.js";
import { isSettings } from "./settings.js";
import { clearSourceCredentials } from "./source-credentials.js";
import {
  resetPricingMetadataRefreshForTests,
  applyPricingCacheMetadata,
} from "../cost/pricing-metadata.js";
import { setProviderContextWindowOverrides } from "../provider/context-window.js";
import { buildSessionSourcesFromConfig } from "../session/runtime-assembly.js";
import { applyLiveModelSwitch } from "../session/live-model-switch.js";
import { generateSessionId, initSessionDir } from "../session/index.js";
import { saveState } from "../session/state.js";
import { createOpenAICompatibleAdapter } from "../provider/openai-compatible-adapter.js";

const directories: string[] = [];

afterEach(async () => {
  resetPricingMetadataRefreshForTests();
  applyPricingCacheMetadata(null);
  setProviderContextWindowOverrides(undefined);
  clearSourceCredentials();
  for (const dir of directories.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

test("config accepts a custom-only local pin and rejects a disabled family rung", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "custom-reasoning-config-"));
  directories.push(cwd);
  const globalSettingsPath = join(cwd, "global.json");
  await mkdir(join(cwd, ".corbits"));
  await writeFile(
    globalSettingsPath,
    JSON.stringify({
      providers: {
        custom: {
          baseURL: "https://custom.example/v1",
          keyless: true,
          models: ["custom-model"],
          reasoningEfforts: ["low", "xhigh", "max"],
          defaultReasoningEffort: "max",
        },
      },
    }),
  );
  const localPath = join(cwd, ".corbits", "settings.json");
  const options = {
    globalSettingsPath,
    home: cwd,
    pricing: {
      cachePath: join(cwd, "pricing.json"),
      fetchImpl: (() =>
        Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    },
  };
  await writeFile(localPath, JSON.stringify({ reasoningEffort: "xhigh" }));
  const config = await loadConfig(["--cwd", cwd], options);
  expect(config.configured).toBe(true);
  if (!config.configured) throw new Error("expected config");
  expect(config.reasoningEffort).toBe("xhigh");
  await writeFile(localPath, JSON.stringify({ reasoningEffort: "medium" }));
  await expect(loadConfig(["--cwd", cwd], options)).rejects.toThrow(
    /supported: low, xhigh, max/,
  );
});

test("settings validate nonempty canonical ladders and enabled defaults", () => {
  const provider = {
    baseURL: "https://custom.example/v1",
    keyless: true,
    models: ["custom-model"],
  };
  const allows = (reasoning: Record<string, unknown>) =>
    isSettings({ providers: { custom: { ...provider, ...reasoning } } });
  expect(allows({})).toBe(true);
  expect(
    allows({ reasoningEfforts: ["low", "max"], defaultReasoningEffort: "max" }),
  ).toBe(true);
  expect(allows({ reasoningEfforts: [] })).toBe(false);
  expect(allows({ reasoningEfforts: ["bogus"] })).toBe(false);
  expect(
    allows({ reasoningEfforts: ["low"], defaultReasoningEffort: "max" }),
  ).toBe(false);
  expect(allows({ defaultReasoningEffort: "max" })).toBe(false);
});

test("startup, resume, and live model switch serialize their custom defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "custom-reasoning-session-"));
  directories.push(cwd);
  const globalSettingsPath = join(cwd, "global.json");
  const custom = {
    baseURL: "https://custom.example/v1",
    keyless: true,
    models: ["custom-model"],
    reasoningEfforts: ["low", "max"],
    defaultReasoningEffort: "max",
  };
  await writeFile(
    globalSettingsPath,
    JSON.stringify({
      defaultProvider: "custom",
      providers: {
        custom,
        other: {
          ...custom,
          reasoningEfforts: ["high", "xhigh"],
          defaultReasoningEffort: "xhigh",
        },
      },
    }),
  );
  const options = {
    globalSettingsPath,
    home: cwd,
    pricing: {
      cachePath: join(cwd, "pricing.json"),
      fetchImpl: (() =>
        Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    },
  };
  const sessionId = generateSessionId();
  await initSessionDir(cwd, sessionId, cwd);
  await saveState(
    cwd,
    sessionId,
    {
      status: "done",
      turnsUsed: 1,
      task: "inspect",
      startedAt: 1,
      finishedAt: 2,
    },
    cwd,
  );
  for (const args of [[], ["resume", sessionId]]) {
    const loaded = await loadConfig([...args, "--cwd", cwd], options);
    if (!loaded.configured) throw new Error("expected config");
    let config = loaded;
    const effortOnWire = () => {
      const source = buildSessionSourcesFromConfig(config, config.sessionId)
        .sources[0];
      if (source === undefined) throw new Error("missing source");
      const adapter = createOpenAICompatibleAdapter({
        sourceId: source.id,
        provider: source.provider,
        model: source.model,
      });
      return (
        JSON.parse(
          adapter.buildRequest([], source.model, source.defaults ?? {}).body,
        ) as Record<string, unknown>
      ).reasoning_effort;
    };
    expect(effortOnWire()).toBe("max");
    let switchedEffort: unknown;
    applyLiveModelSwitch(
      { providerName: "other", model: "custom-model" },
      {
        applyIdentity: (next) => {
          config = { ...config, ...next };
        },
        setPermissionIdentity: () => undefined,
        rebuildInference: () => {
          switchedEffort = effortOnWire();
        },
        refreshAdvertisedSchemas: () => undefined,
      },
    );
    expect(switchedEffort).toBe("xhigh");
  }
});
