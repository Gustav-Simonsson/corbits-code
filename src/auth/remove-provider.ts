import { codexProfileFromProviderName } from "../config/codex-providers.js";
import {
  removeCodexProfile,
  removeXaiProfile,
} from "../config/oauth-stores.js";
import type { ProviderCatalogEntry } from "../config/index.js";
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

// Maps a catalog provider to its OAuth auth store only when the current catalog
// entry carries the matching auth-store profile marker. Names alone are
// user-controlled and cannot authorize credential deletion.
export function oauthStoreForProvider(
  provider: Pick<
    ProviderCatalogEntry,
    "name" | "codexProfile" | "xaiProfile"
  > | null,
): OAuthStoreTarget | null {
  if (provider === null) return null;
  const providerName = provider.name;
  const codexProfile = codexProfileFromProviderName(providerName);
  if (
    codexProfile !== undefined &&
    codexProfile === provider.codexProfile &&
    codexProfile.length > 0
  ) {
    return { profile: codexProfile, removeProfile: removeCodexProfile };
  }
  const xaiProfile = xaiProfileFromProviderName(providerName);
  if (
    xaiProfile !== undefined &&
    xaiProfile === provider.xaiProfile &&
    xaiProfile.length > 0
  ) {
    return { profile: xaiProfile, removeProfile: removeXaiProfile };
  }
  return null;
}
