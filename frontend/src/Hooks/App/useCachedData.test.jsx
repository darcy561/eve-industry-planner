import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { CACHED_DATA_FILES } from "../../Context/defaultValues";
import { testQueryClient } from "../../tests/queryClients.js";

const getFullItemList = vi.fn();
const getSearchIndex = vi.fn();
const getReprocessingData = vi.fn();
const getRecipeListFromCache = vi.fn();
const getMarketGroups = vi.fn();
const getSolarSystems = vi.fn();

vi.mock("../../Functions/Helper/getCachedData", () => ({
  getFullItemList: (...args) => getFullItemList(...args),
  getSearchIndex: (...args) => getSearchIndex(...args),
  getReprocessingData: (...args) => getReprocessingData(...args),
  getRecipeListFromCache: (...args) => getRecipeListFromCache(...args),
  getMarketGroups: (...args) => getMarketGroups(...args),
  getSolarSystems: (...args) => getSolarSystems(...args),
}));

const { useCachedData } = await import("./useCachedData.js");

function withClient(client = testQueryClient()) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** A client that does not retry, so a failing read fails once and reports it. */
function quietClient() {
  return testQueryClient();
}

beforeEach(() => {
  vi.clearAllMocks();
  getFullItemList.mockResolvedValue({ 34: { name: "Tritanium" } });
  getSearchIndex.mockResolvedValue([{ typeID: 34 }]);
  getReprocessingData.mockResolvedValue({ 34: {} });
  getRecipeListFromCache.mockResolvedValue({ 587: {} });
  getMarketGroups.mockResolvedValue({ 1857: { name: "Minerals" } });
  getSolarSystems.mockResolvedValue({ 30000142: "Jita" });
});

describe("useCachedData", () => {
  const cases = [
    [CACHED_DATA_FILES.FULL_ITEM_LIST, () => getFullItemList],
    [CACHED_DATA_FILES.SEARCH_INDEX, () => getSearchIndex],
    [CACHED_DATA_FILES.REPROCESSING_DATA, () => getReprocessingData],
    [CACHED_DATA_FILES.RECIPE_LIST, () => getRecipeListFromCache],
    [CACHED_DATA_FILES.MARKET_GROUPS, () => getMarketGroups],
    [CACHED_DATA_FILES.SOLAR_SYSTEMS, () => getSolarSystems],
  ];

  for (const [dataType, reader] of cases) {
    it(`reads the file ${dataType} names`, async () => {
      const { result } = renderHook(() => useCachedData(dataType), {
        wrapper: withClient(),
      });

      await waitFor(() => expect(result.current.data).toBeTruthy());
      expect(reader()).toHaveBeenCalledTimes(1);
    });
  }

  // Callers destructure isLoading and isError. A hook answering under other
  // names leaves every loading and error branch it feeds permanently false.
  it("reports its state under the names its callers read", async () => {
    const { result } = renderHook(
      () => useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST),
      { wrapper: withClient() },
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(false);
  });

  it("reports a failed read rather than an empty one", async () => {
    getFullItemList.mockRejectedValue(new Error("no cache"));
    const { result } = renderHook(
      () => useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST),
      { wrapper: withClient(quietClient()) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  // The file is one read for the whole app: two components asking share it
  // rather than holding a copy each.
  it("reads a file once however many components ask", async () => {
    const client = testQueryClient();
    const { result: first } = renderHook(
      () => useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST),
      { wrapper: withClient(client) },
    );
    const { result: second } = renderHook(
      () => useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST),
      { wrapper: withClient(client) },
    );

    await waitFor(() => expect(first.current.data).toBeTruthy());
    expect(second.current.data).toBe(first.current.data);
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  it("keeps the files apart", async () => {
    const client = testQueryClient();
    renderHook(() => useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST), {
      wrapper: withClient(client),
    });
    const { result } = renderHook(
      () => useCachedData(CACHED_DATA_FILES.SEARCH_INDEX),
      { wrapper: withClient(client) },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(getSearchIndex).toHaveBeenCalledTimes(1);
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  it("surfaces a name it does not know rather than reading nothing", async () => {
    const { result } = renderHook(() => useCachedData("not-a-file"), {
      wrapper: withClient(quietClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
