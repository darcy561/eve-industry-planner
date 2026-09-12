import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getMarketData, addMarketData } = vi.hoisted(() => ({
  getMarketData: vi.fn(async () => ({})),
  addMarketData: vi.fn(),
}));

vi.mock("../../../Functions/MarketData/findMarketData", () => ({
  default: getMarketData,
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ worldData: { actions: { addMarketData } } }),
  );
});

const { useMarketPricesQuery } = await import("./marketPrices.js");

function Subject({ typeIDs, enabled }) {
  const { isLoading } = useMarketPricesQuery(typeIDs, { enabled });
  return <p>{isLoading ? "pricing" : "priced"}</p>;
}

let client;

function show(props) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Subject {...props} />
    </QueryClientProvider>,
  );
}

function again(props) {
  return (
    <QueryClientProvider client={client}>
      <Subject {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMarketData.mockResolvedValue({ 34: { buy: 5, sell: 6 } });
});

describe("pricing a set of items", () => {
  it("asks for the ids it was given", async () => {
    show({ typeIDs: [34, 35] });

    await waitFor(() => expect(getMarketData).toHaveBeenCalled());
    expect([...getMarketData.mock.calls[0][0]]).toEqual(["34", "35"]);
  });

  it("keeps what it finds in the world data store", async () => {
    show({ typeIDs: [34] });

    await waitFor(() =>
      expect(addMarketData).toHaveBeenCalledWith({ 34: { buy: 5, sell: 6 } }),
    );
  });

  it("says when it has finished", async () => {
    show({ typeIDs: [34] });

    expect(screen.getByText("pricing")).toBeInTheDocument();
    expect(await screen.findByText("priced")).toBeInTheDocument();
  });

  it("asks for nothing when there is nothing to price", async () => {
    show({ typeIDs: [] });

    expect(screen.getByText("priced")).toBeInTheDocument();
    expect(getMarketData).not.toHaveBeenCalled();
  });

  it("waits until it is enabled", () => {
    show({ typeIDs: [34], enabled: false });

    expect(getMarketData).not.toHaveBeenCalled();
  });

  // The same items are the same request however they were handed over: in a
  // different order, with repeats, or as a set rather than a list.
  it("does not ask twice for the same items", async () => {
    const { rerender } = show({ typeIDs: [34, 35] });
    await waitFor(() => expect(getMarketData).toHaveBeenCalledTimes(1));

    rerender(again({ typeIDs: [35, 34, 35] }));
    rerender(again({ typeIDs: new Set([34, 35]) }));

    expect(getMarketData).toHaveBeenCalledTimes(1);
  });
});
