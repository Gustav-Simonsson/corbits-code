import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import {
  listCodexProfiles,
  loadCodexProfile,
  saveCodexProfile,
} from "../config/oauth-stores.js";
import {
  listXaiProfiles,
  loadXaiProfile,
  saveXaiProfile,
} from "../config/oauth-stores.js";
import {
  clearSourceCredentials,
  registerSourceCredentialRecord,
} from "../config/source-credentials.js";
import { oauthStoreForProvider } from "./remove-provider.js";

function registerOAuthProvider(
  providerName: string,
  provider: "codex" | "xai",
  profile: string,
): void {
  registerSourceCredentialRecord(providerName, {
    provenance: { kind: "oauth", provider, profile },
    material: { secret: "token" },
  });
}

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "remove-provider-"));
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

describe("oauthStoreForProvider", () => {
  afterEach(() => {
    clearSourceCredentials();
  });

  test("maps xai/ and codex/ provider names to their store and profile", () => {
    clearSourceCredentials();
    registerOAuthProvider("xai/work", "xai", "work");
    registerOAuthProvider("codex/personal", "codex", "personal");
    expect(oauthStoreForProvider("xai/work")?.profile).toBe("work");
    expect(oauthStoreForProvider("codex/personal")?.profile).toBe("personal");
  });

  test("rejects namespaced custom providers without OAuth ownership", () => {
    clearSourceCredentials();
    registerSourceCredentialRecord("codex/manual", {
      provenance: { kind: "api-key" },
      material: { secret: "manual-key" },
    });
    registerSourceCredentialRecord("xai/manual", {
      provenance: { kind: "api-key" },
      material: { secret: "manual-key" },
    });

    expect(oauthStoreForProvider("codex/manual")).toBeNull();
    expect(oauthStoreForProvider("xai/manual")).toBeNull();
  });

  test("returns null for API-key, keyless, and degenerate names", () => {
    expect(oauthStoreForProvider("openai")).toBeNull();
    expect(oauthStoreForProvider("ollama")).toBeNull();
    expect(oauthStoreForProvider("my-custom")).toBeNull();
    expect(oauthStoreForProvider("xai/")).toBeNull();
    expect(oauthStoreForProvider("codex/")).toBeNull();
  });

  test("removing an xai profile leaves sibling profiles untouched", async () => {
    await withHome(async (home) => {
      clearSourceCredentials();
      registerOAuthProvider("xai/work", "xai", "work");
      const tokens = { access: "a", refresh: "r", expiresAt: 10_000_000 };
      await saveXaiProfile({ name: "work", createdAt: 0, tokens }, home);
      await saveXaiProfile({ name: "personal", createdAt: 0, tokens }, home);

      const target = oauthStoreForProvider("xai/work");
      expect(target?.profile).toBe("work");
      expect(await target?.removeProfile(target.profile, home)).toEqual([
        "work",
      ]);
      expect(await loadXaiProfile("work", home)).toBeUndefined();
      expect(
        (await listXaiProfiles(home)).map((profile) => profile.name),
      ).toEqual(["personal"]);
    });
  });

  test("removing a codex profile leaves sibling profiles untouched", async () => {
    await withHome(async (home) => {
      clearSourceCredentials();
      registerOAuthProvider("codex/night", "codex", "night");
      const tokens = { access: "a", refresh: "r", expiresAt: 10_000_000 };
      await saveCodexProfile({ name: "day", createdAt: 0, tokens }, home);
      await saveCodexProfile({ name: "night", createdAt: 0, tokens }, home);

      const target = oauthStoreForProvider("codex/night");
      expect(await target?.removeProfile(target.profile, home)).toEqual([
        "night",
      ]);
      expect(await loadCodexProfile("night", home)).toBeUndefined();
      expect(
        (await listCodexProfiles(home)).map((profile) => profile.name),
      ).toEqual(["day"]);
    });
  });

  test("removing an already-absent profile is a no-op", async () => {
    await withHome(async (home) => {
      clearSourceCredentials();
      registerOAuthProvider("xai/ghost", "xai", "ghost");
      const target = oauthStoreForProvider("xai/ghost");
      expect(await target?.removeProfile(target.profile, home)).toEqual([]);
    });
  });

  test("missing auth files are tolerated", async () => {
    await withHome(async (home) => {
      clearSourceCredentials();
      registerOAuthProvider("xai/work", "xai", "work");
      registerOAuthProvider("codex/work", "codex", "work");
      // No profiles ever saved: the store treats a missing file as empty.
      const xai = oauthStoreForProvider("xai/work");
      expect(await xai?.removeProfile(xai.profile, home)).toEqual([]);
      const codex = oauthStoreForProvider("codex/work");
      expect(await codex?.removeProfile(codex.profile, home)).toEqual([]);
    });
  });
});
