// First-party credential cell backing the vendored inference auth model.
//
// Since the 1ad0104 re-vendor, `InferenceSource` carries no inline secret:
// it names a `credentialId` and every send resolves the secret through a
// `CredentialMaterialResolver` ("credential cell" in upstream terms — read
// `CredentialMaterialResolver`'s doc comment in the vendored
// `@intx/types`). This module is that cell for first-party API-key and
// OAuth access-token sources: each `buildXSource` in `./index.ts` registers
// the secret it was built with under the source id, and the inference entry
// points (`assemble-runtime`, subagent run, summarizer fallback) hand
// `readSourceCredentialMaterial` to the vendored trees as their resolver.
//
// Keyed by source id because ids are unique per live source within a
// process. The map lives at module scope so sources built in one layer
// (config) resolve in another (agent env, reactor options) without threading
// secrets through every intermediate shape.
import type { CredentialMaterialResolver } from "@intx/types";

const cell = new Map<string, string>();

export function registerSourceCredential(
  credentialId: string,
  secret: string,
): void {
  cell.set(credentialId, secret);
}

/** The resolver handed to vendored inference calls. Fails closed. */
export const readSourceCredentialMaterial: CredentialMaterialResolver = (
  credentialId: string,
) => {
  const secret = cell.get(credentialId);
  if (secret === undefined)
    throw new Error(`Unknown inference credential "${credentialId}".`);
  return { secret };
};

/** Non-throwing read for "did the token change?" comparisons. */
export function peekSourceCredentialSecret(
  credentialId: string,
): string | undefined {
  return cell.get(credentialId);
}

/** Test seam: empties the cell between cases. */
export function clearSourceCredentials(): void {
  cell.clear();
}
