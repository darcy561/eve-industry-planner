import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getFullItemList = vi.fn();

vi.mock("../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({ getFullItemList: (...args) => getFullItemList(...args) });
});

const { useItemNames } = await import("./useItemNames.js");

function wrapper(client) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getFullItemList.mockResolvedValue({ 34: { name: "Tritanium" } });
});

describe("useItemNames", () => {
  it("names the rows it was given", async () => {
    const { result } = renderHook(() => useItemNames([{ typeID: 34 }]), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current[34]).toBe("Tritanium"));
  });

  // A row without a name is still a row worth reading: the figures beside it
  // mean something against the type id.
  it("falls back to the type id", async () => {
    const { result } = renderHook(() => useItemNames([{ typeID: 99 }]), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(result.current[99]).toBe("Type 99"));
  });

  it("holds nothing until the list arrives", () => {
    getFullItemList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useItemNames([{ typeID: 34 }]), {
      wrapper: wrapper(new QueryClient()),
    });

    expect(result.current).toEqual({});
  });

  // Every caller shares the read, which is what makes this cheaper than
  // resolving a name per row.
  it("reads the list once for every caller", async () => {
    const client = new QueryClient();
    const { result: first } = renderHook(() => useItemNames([{ typeID: 34 }]), {
      wrapper: wrapper(client),
    });
    const { result: second } = renderHook(() => useItemNames([{ typeID: 34 }]), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(first.current[34]).toBe("Tritanium"));
    expect(second.current[34]).toBe("Tritanium");
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });
});
