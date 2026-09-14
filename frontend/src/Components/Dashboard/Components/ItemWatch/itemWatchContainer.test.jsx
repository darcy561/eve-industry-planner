import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../../../tests/queryClients.js";

const { store, fetchPrices } = vi.hoisted(() => ({
  store: { current: null },
  fetchPrices: vi.fn(async () => {}),
}));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../../Functions/MarketData/priceCache", () => ({
  fetchPrices,
  MARKET_PRICES_QUERY_KEY: ["market", "prices"],
}));

vi.mock("./ItemRow", () => ({
  WatchListRow: ({ item }) => <p>row for {item.name}</p>,
}));

vi.mock("./watchlistGroup", () => ({
  WatchlistGroup: ({ group }) => <p>group {group.name}</p>,
}));

const { WatchlistContainer } = await import("./itemWatchContainer.jsx");

const theme = createTheme();

function watching({ items = [], groups = [] } = {}) {
  store.current = {
    jobData: { userWatchlist: { items, groups } },
    applicationSettings: {
      defaultPricing: {
        buying: { market: "jita", basis: "sell" },
        // Deliberately different: a fixture whose sides agree cannot tell a
        // surface asking for the wrong one.
        selling: { market: "amarr", basis: "buy" },
      },
    },
  };
}

function item(id, name, typeID) {
  return { id, name, typeID, group: 0, materials: [] };
}

function show() {
  const client = testQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <WatchlistContainer
          onOpenGroupSettings={() => {}}
          onEditWatchlistItem={() => {}}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchPrices.mockResolvedValue(undefined);
  watching({ items: [item("i-1", "Tritanium", 34)] });
});

describe("the watchlist", () => {
  it("says so when nothing is on it", () => {
    watching();

    show();

    expect(
      screen.getByText("You have no items on your watchlist."),
    ).toBeInTheDocument();
  });

  // Rows show prices, so they wait for the prices rather than drawing blanks.
  it("waits for prices before showing its rows", () => {
    show();

    expect(screen.getByText("Loading market data…")).toBeInTheDocument();
    expect(screen.queryByText(/row for/)).toBeNull();
  });

  it("shows its rows once the prices are in", async () => {
    show();

    expect(await screen.findByText("row for Tritanium")).toBeInTheDocument();
  });

  // The item's own figure is what it would fetch, so it is wanted at the
  // selling market rather than the one its materials are bought at.
  it("asks for the item at the selling market", async () => {
    show();

    await waitFor(() => expect(fetchPrices).toHaveBeenCalled());
    expect(fetchPrices.mock.calls[0][0].wants).toEqual([
      { typeID: 34, sourceID: "amarr" },
    ]);
  });

  it("shows its rows even if the prices cannot be fetched", async () => {
    fetchPrices.mockRejectedValue(new Error("no market"));

    show();

    expect(await screen.findByText("row for Tritanium")).toBeInTheDocument();
  });

  it("does not go looking for prices when the list is empty of items", () => {
    watching({ groups: [{ id: 1, name: "Minerals" }] });

    show();

    expect(fetchPrices).not.toHaveBeenCalled();
    expect(screen.getByText("group Minerals")).toBeInTheDocument();
  });
});
