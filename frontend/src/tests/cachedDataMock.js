import { vi } from "vitest";

/**
 * The static data files as a test sees them.
 *
 * Every export is here, including the cache plumbing a test never reads,
 * because Vitest throws on one a factory left out. This module gains readers as
 * new static files ship — six in the last two days — and each time, a mock
 * naming only the files its subject reads fails on setup with a complaint about
 * the mock rather than about the code.
 */

/**
 * @param {Object} [overrides] - Replaces any export by name.
 * @returns {Object} the module body for `vi.mock("…/Functions/Helper/getCachedData")`
 */
export function cachedDataMock(overrides = {}) {
  return {
    // The readers a test usually cares about. An item list is keyed by type id;
    // the search index is a list.
    getFullItemList: vi.fn(async () => ({})),
    getSearchIndex: vi.fn(async () => []),
    getReprocessingData: vi.fn(async () => ({})),
    getRecipeListFromCache: vi.fn(async () => ({})),
    getMarketGroups: vi.fn(async () => ({})),
    getSolarSystems: vi.fn(async () => ({})),

    // The cache itself. A test that mocks this module is not exercising the
    // cache, so these answer as though nothing is stored and no version is
    // known — which is what the readers above already pretend.
    getCachedData: vi.fn(async () => null),
    getStaticDataBuildVersion: vi.fn(async () => null),
    checkFileInCache: vi.fn(async () => null),
    checkFileInCacheWithMetadata: vi.fn(async () => null),
    refreshStaticDataCache: vi.fn(async () => undefined),
    resetStaticDataCacheState: vi.fn(),

    ...overrides,
  };
}
