import {
  OPENCODE_GO_BASE_URL,
  OPENCODE_GO_MODEL_IDS,
} from "../../packages/opencode-go/src/index.js";
import {
  createBoundedModelCatalog,
  type CatalogDiscoveryState,
} from "./bounded-model-catalog.js";

// Bound live /models so a huge or hostile catalog cannot blow process memory.
export const MAX_GO_CATALOG_BYTES = 256 * 1024;
export const MAX_GO_CATALOG_MODELS = 1024;

export type GoDiscoveryState = CatalogDiscoveryState;

const catalog = createBoundedModelCatalog({
  baseURL: OPENCODE_GO_BASE_URL,
  seedIds: OPENCODE_GO_MODEL_IDS,
  catalogLabel: "OpenCode Go",
  maxBytes: MAX_GO_CATALOG_BYTES,
  maxModels: MAX_GO_CATALOG_MODELS,
});

/** Discover public OpenCode Go models without leaking transport or parsing failures. */
export const discoverGoModels = catalog.discoverModels;

/** Sync picker ids: last successful live list, else the packaged seed. Never empty. */
export const selectableGoModelIds = catalog.selectableModelIds;

/** Join or start a live fetch; the snapshot is the cache, inflight is only a mutex. */
export const prefetchGoModels = catalog.prefetchModels;

export const resetGoModelDiscoveryForTests = catalog.resetDiscoveryForTests;
