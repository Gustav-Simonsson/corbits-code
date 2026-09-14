import {
  ZEN_DEFAULT_BASE_URL,
  ZEN_MODEL_IDS,
} from "../../packages/zen/src/index.js";
import {
  createBoundedModelCatalog,
  type CatalogDiscoveryState,
} from "./bounded-model-catalog.js";

// Bound live /models so a huge or hostile catalog cannot blow process memory.
export const MAX_ZEN_CATALOG_BYTES = 256 * 1024;
export const MAX_ZEN_CATALOG_MODELS = 1024;

export type ZenDiscoveryState = CatalogDiscoveryState;

const catalog = createBoundedModelCatalog({
  baseURL: ZEN_DEFAULT_BASE_URL,
  seedIds: ZEN_MODEL_IDS,
  catalogLabel: "OpenCode Zen",
  maxBytes: MAX_ZEN_CATALOG_BYTES,
  maxModels: MAX_ZEN_CATALOG_MODELS,
});

/** Discover public OpenCode Zen models without leaking transport or parsing failures. */
export const discoverZenModels = catalog.discoverModels;

/** Sync picker ids: last successful live list, else the packaged seed. Never empty. */
export const selectableZenModelIds = catalog.selectableModelIds;

/** Join or start a live fetch; the snapshot is the cache, inflight is only a mutex. */
export const prefetchZenModels = catalog.prefetchModels;

export const resetZenModelDiscoveryForTests = catalog.resetDiscoveryForTests;
