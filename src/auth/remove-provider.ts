import { codexProfileFromProviderName } from "../config/codex-providers.js";
import {
  removeCodexProfile,
  removeXaiProfile,
} from "../config/oauth-stores.js";
import { xaiProfileFromProviderName } from "../config/xai-providers.js";

/**
 * The auth-store side of removing an OAuth-projected provider. Owns no UI
 * and performs no settings edits — the caller deletes the catalog row and
 * only then drops the credential through this target.
 */
export interface OAuthStoreTarget {
  /** Profile name embedded in the "<prefix><profile>" provider name. */
  readonly profile: string;
  /** Bound store removal; sibling profiles in the same file are untouched. */
  readonly removeProfile: (
    name: string | undefined,
    home?: string,
  ) => Promise<string[]>;
}

// Maps a catalog provider name to its OAuth auth store + profile using the
// projection helpers (never string-splitting at the call site). Returns null
// for API-key, Custom, Ollama/keyless, and degenerate empty-profile names —
// those delete settings-side only.
export function oauthStoreForProvider(
  providerName: string,
): OAuthStoreTarget | null {
  const codexProfile = codexProfileFromProviderName(providerName);
  if (codexProfile !== undefined && codexProfile.length > 0) {
    return { profile: codexProfile, removeProfile: removeCodexProfile };
  }
  const xaiProfile = xaiProfileFromProviderName(providerName);
  if (xaiProfile !== undefined && xaiProfile.length > 0) {
    return { profile: xaiProfile, removeProfile: removeXaiProfile };
  }
  return null;
}
