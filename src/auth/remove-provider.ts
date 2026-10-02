import { codexProfileFromProviderName } from "../config/codex-providers.js";
import {
  removeCodexProfile,
  removeXaiProfile,
} from "../config/oauth-stores.js";
import { findSourceCredentialRecord } from "../config/source-credentials.js";
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

// Maps a catalog provider to its OAuth auth store only when the live source
// credential record proves ownership of the same provider family and profile.
// Names alone are user-controlled and cannot authorize credential deletion.
export function oauthStoreForProvider(
  providerName: string,
): OAuthStoreTarget | null {
  const provenance = findSourceCredentialRecord(providerName)?.provenance;
  if (provenance?.kind !== "oauth") return null;
  const codexProfile = codexProfileFromProviderName(providerName);
  if (
    provenance.provider === "codex" &&
    codexProfile === provenance.profile &&
    codexProfile.length > 0
  ) {
    return { profile: codexProfile, removeProfile: removeCodexProfile };
  }
  const xaiProfile = xaiProfileFromProviderName(providerName);
  if (
    provenance.provider === "xai" &&
    xaiProfile === provenance.profile &&
    xaiProfile.length > 0
  ) {
    return { profile: xaiProfile, removeProfile: removeXaiProfile };
  }
  return null;
}
