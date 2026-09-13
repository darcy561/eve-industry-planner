import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getFullItemList = vi.fn();
const getSearchIndex = vi.fn();

vi.mock("../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({
    getFullItemList: (...args) => getFullItemList(...args),
    getSearchIndex: (...args) => getSearchIndex(...args),
  });
});

const {
  useItemList,
  useItemNames,
  useItemRecord,
  useItemSearchIndex,
  readCachedItemSearchIndex,
} = await import("./useItems.js");

function wrapper(client) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getFullItemList.mockResolvedValue({
    34: { type_id: 34, name: "Tritanium", category_id: 4 },
  });
  getSearchIndex.mockResolvedValue([
    { itemID: 34, name: "Tritanium", blueprintID: 1000 },
  ]);
});

describe("useItemNames", () => {
  it("names the ids it was given", async () => {
    const { result } = renderHook(() => useItemNames([34]), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current[34]).toBe("Tritanium"));
  });

  // Rows carrying a type id are what most callers hold, so both shapes are taken.
  it("takes rows carrying a type id", async () => {
    const { result } = renderHook(() => useItemNames([{ typeID: 34 }]), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current[34]).toBe("Tritanium"));
  });

  // A row without a name is still a row worth reading: the figures beside it
  // mean something against the type id.
  it("falls back to the type id", async () => {
    const { result } = renderHook(() => useItemNames([99]), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current[99]).toBe("Unknown Item - 99"));
  });

  it("holds nothing until the list arrives", () => {
    getFullItemList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useItemNames([34]), {
      wrapper: wrapper(new QueryClient()),
    });

    expect(result.current).toEqual({});
  });

  // Every caller shares the read, which is what makes this cheaper than
  // resolving a name per row.
  it("reads the list once for every caller", async () => {
    const client = new QueryClient();
    const { result: first } = renderHook(() => useItemNames([34]), {
      wrapper: wrapper(client),
    });
    const { result: second } = renderHook(() => useItemNames([34]), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(first.current[34]).toBe("Tritanium"));
    expect(second.current[34]).toBe("Tritanium");
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  // A caller building its list in render hands a new array every time; the ids decide.
  it("holds the same names across a rebuilt list", async () => {
    const client = new QueryClient();
    const { result, rerender } = renderHook(() => useItemNames([34]), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current[34]).toBe("Tritanium"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useItemList", () => {
  it("carries every record once the file arrives", async () => {
    const { result } = renderHook(() => useItemList(), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() =>
      expect(result.current.records[34]?.category_id).toBe(4),
    );
  });

  // The shared empty map is what a consumer indexes before the file arrives, so a lookup answers
  // nothing rather than throwing.
  it("answers an empty map while loading", () => {
    getFullItemList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useItemList(), {
      wrapper: wrapper(new QueryClient()),
    });

    expect(result.current.records).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });
});

describe("useItemRecord", () => {
  it("gives one record", async () => {
    const { result } = renderHook(() => useItemRecord(34), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current?.name).toBe("Tritanium"));
  });

  it("answers nothing for a type the list does not carry", async () => {
    const { result } = renderHook(() => useItemRecord(99), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current).toBeUndefined());
  });
});

describe("the search index", () => {
  // A different file and a different shape from the records, and never handed over as one.
  it("comes back as entries", async () => {
    const { result } = renderHook(() => useItemSearchIndex(), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.entries[0].blueprintID).toBe(1000);
  });

  it("reads what the cache already holds, for a caller outside a render", async () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useItemSearchIndex(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(readCachedItemSearchIndex(client)).toHaveLength(1);
  });

  it("answers empty where nothing has loaded", () => {
    expect(readCachedItemSearchIndex(new QueryClient())).toEqual([]);
  });
});
