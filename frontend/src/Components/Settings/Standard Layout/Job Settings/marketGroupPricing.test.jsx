import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../../../tests/queryClients.js";

const { store, tree } = vi.hoisted(() => ({
  store: { applicationSettings: { defaultPricing: {} } },
  tree: { current: {} },
}));

vi.mock("../../../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector(store), {
    getState: () => store,
  }),
}));

vi.mock("../../../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: tree.current,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const { default: MarketGroupPricing } = await import("./marketGroupPricing");

// Minerals sits inside a container, so a row has a path to state. The container
// is not called "Materials": that is the buying side's own heading, and a
// fixture sharing it could not tell a path from a section title.
const TREE = {
  1849: { name: "Manufacture & Research", children: [1857] },
  1857: { name: "Minerals", parent_id: 1849, has_types: true },
};

// The two sides carry different groups, so a section reading the wrong one is
// visible rather than passing on a fixture that agrees with itself.
function seed({ buying, selling } = {}) {
  store.applicationSettings.defaultPricing = {
    buying: { market: "jita", basis: "sell", groups: buying },
    selling: { market: "amarr", exit: "listed", groups: selling },
  };
  tree.current = TREE;
}

const renderPanel = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MarketGroupPricing />
    </QueryClientProvider>,
  );

describe("the market group pricing panel", () => {
  it("states a group's name and what it prices against", () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    expect(screen.getByText("Minerals")).toBeInTheDocument();
    expect(screen.getByText("Hek · Buy Orders")).toBeInTheDocument();
  });

  // The name alone does not say whether it is the group the reader meant, and a
  // default set on a container covers everything beneath it.
  it("states where the group sits", () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    expect(screen.getByText("Manufacture & Research")).toBeInTheDocument();
  });

  it("lists each side's own groups", () => {
    seed({
      buying: { 1857: { market: "hek", basis: "buy" } },
      selling: { 1849: { market: "dodixie" } },
    });
    renderPanel();

    expect(screen.getByText("Hek · Buy Orders")).toBeInTheDocument();
    expect(screen.getByText("Dodixie · —")).toBeInTheDocument();
  });

  it("says a side has none rather than showing an empty box", () => {
    seed({ buying: { 1857: { market: "hek" } } });
    renderPanel();

    expect(screen.getByText(/Nothing set/)).toBeInTheDocument();
  });

  // A reader has to be able to see a choice in order to clear it, so a group the
  // published tree no longer carries is still a row.
  it("shows a group the tree no longer carries", () => {
    seed({ buying: { 99999: { market: "jita" } } });
    renderPanel();

    expect(screen.getByText("Group 99999")).toBeInTheDocument();
  });
});
