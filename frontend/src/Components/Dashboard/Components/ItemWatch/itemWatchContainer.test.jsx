import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { store, getMarketData, addMarketData } = vi.hoisted(() => ({
  store: { current: null },
  getMarketData: vi.fn(async () => ({})),
  addMarketData: vi.fn(),
}));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../../Functions/MarketData/findMarketData", () => ({
  default: getMarketData,
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
    worldData: { actions: { addMarketData } },
  };
}

function item(id, name, typeID) {
  return { id, name, typeID, group: 0, materials: [] };
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
  getMarketData.mockResolvedValue({ 34: { buy: 5 } });
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

  it("keeps the prices it fetched", async () => {
    show();

    await waitFor(() =>
      expect(addMarketData).toHaveBeenCalledWith({ 34: { buy: 5 } }),
    );
  });

  it("shows its rows even if the prices cannot be fetched", async () => {
    getMarketData.mockRejectedValue(new Error("no market"));

    show();

    expect(await screen.findByText("row for Tritanium")).toBeInTheDocument();
  });

  it("does not go looking for prices when the list is empty of items", () => {
    watching({ groups: [{ id: 1, name: "Minerals" }] });

    show();

    expect(getMarketData).not.toHaveBeenCalled();
    expect(screen.getByText("group Minerals")).toBeInTheDocument();
  });
});
